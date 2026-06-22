/**
 * [Life Thread 엔진]
 * 뉴런 알고리즘 오케스트레이터 — DB 연동.
 * AiSoul의 Life Thread 생성/조회/Phase 전환/완료를 관리합니다.
 *
 * 사용처: Heartbeat 오케스트레이터에서 호출.
 *
 * 설계 출처: docs/2_AI_은하_설계/12_뉴런_알고리즘_설계서_v1.md §3
 */

import prisma from '@/shared/lib/prisma'
import type { AiLifeThread } from '@prisma/client'
import { advanceProjectPhase, advanceLifeEventPhase } from './narrativeBeat'
import { applyPhaseEmotion, parsePADState, type PADState } from './padEmotionEngine'
import { rollLifeEvent, isAlreadyCheckedToday } from './lifeEventEngine'

// ─── 타입 ────────────────────────────────────────────────────

export interface ActiveThread {
  id: string
  type: 'PROJECT' | 'LIFE_EVENT'
  title: string
  category: string
  desire: string | null
  currentPhase: number
  padState: PADState
  dayCount: number
  cycleCount: number
  lastEventSummary: string | null
  /** v2: Thread 시작일 (dayCount 실계산용) */
  startedAt: Date
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * Soul의 활성 Thread 목록을 조회합니다.
 */
export async function getActiveThreads(soulId: string): Promise<ActiveThread[]> {
  const threads = await prisma.aiLifeThread.findMany({
    where: { soulId, isActive: true },
    orderBy: { startedAt: 'asc' },
  })

  return threads.map((t: AiLifeThread) => ({
    id: t.id,
    type: t.type as 'PROJECT' | 'LIFE_EVENT',
    title: t.title,
    category: t.category,
    desire: t.desire,
    currentPhase: t.currentPhase,
    padState: parsePADState(t.padState),
    dayCount: t.dayCount,
    cycleCount: t.cycleCount,
    lastEventSummary: t.lastEventSummary,
    startedAt: t.startedAt,
  }))
}

/**
 * 포스팅에 사용할 Thread 1개를 선택합니다.
 * Life Event > Project Thread 우선순위.
 */
export function selectThreadForPost(threads: ActiveThread[]): ActiveThread | null {
  // Life Event가 있으면 우선
  const lifeEvent = threads.find((t) => t.type === 'LIFE_EVENT')
  if (lifeEvent) return lifeEvent

  // Project Thread 중 Phase가 가장 활발한 것 (PAD Arousal 높은 순)
  const projects = threads.filter((t) => t.type === 'PROJECT')
  if (projects.length === 0) return null

  projects.sort((a, b) => Math.abs(b.padState.A) - Math.abs(a.padState.A))
  return projects[0]
}

/**
 * Thread의 Phase를 전진시키고 DB를 업데이트합니다.
 *
 * @param threadId Thread ID
 * @param persona 성격 (E/I, T/F, S/N 10축)
 */
export async function advanceThread(
  threadId: string,
  persona?: { e_i: number; t_f: number; s_n?: number },
): Promise<ActiveThread | null> {
  const thread = await prisma.aiLifeThread.findUnique({ where: { id: threadId } })
  if (!thread || !thread.isActive) return null

  const type = thread.type as 'PROJECT' | 'LIFE_EVENT'

  // Phase 전환
  const transition = type === 'PROJECT'
    ? advanceProjectPhase(thread.currentPhase, persona)
    : advanceLifeEventPhase(thread.currentPhase)

  // PAD 업데이트
  const currentPAD = parsePADState(thread.padState)
  const newPAD = applyPhaseEmotion(currentPAD, transition.newPhase, type)

  // Phase 이력 추가
  const phaseHistory = [...(thread.phaseHistory || []), String(transition.newPhase)]

  // Life Event GROW(4) 완료 체크
  const isCompleted = type === 'LIFE_EVENT' && transition.newPhase >= 4 && transition.transitionType === 'STAY'

  // Project CLOSURE(9) → 새 사이클 시작
  const isNewCycle = type === 'PROJECT' && thread.currentPhase >= 9 && transition.newPhase === 0

  const updated = await prisma.aiLifeThread.update({
    where: { id: threadId },
    data: {
      currentPhase: transition.newPhase,
      padState: newPAD as unknown as Record<string, number>,
      phaseHistory,
      dayCount: thread.dayCount + 1,
      cycleCount: isNewCycle ? thread.cycleCount + 1 : thread.cycleCount,
      isActive: !isCompleted,
      completedAt: isCompleted ? new Date() : null,
    },
  })

  // v2: Thread 자동 교체 — CLOSURE → 새 사이클 2회 이상이면 Thread 완료 + 새 Thread 생성
  if (isNewCycle && updated.cycleCount >= 2) {
    // 기존 Thread 완료 처리
    await prisma.aiLifeThread.update({
      where: { id: threadId },
      data: { isActive: false, completedAt: new Date() },
    })

    // 새 Thread 자동 생성 (soulId로 직업/관심사 조회)
    const soul = await prisma.aiSoul.findUnique({
      where: { id: updated.soulId },
      select: { userId: true },
    })
    if (soul) {
      const persona = await prisma.userPersona.findUnique({
        where: { user_id: soul.userId },
        select: { occupation: true, interest_tags: true },
      })
      const newThread = pickNextThread(
        persona?.occupation || '사무직/회사원',
        persona?.interest_tags || [],
        updated.category, // 직전 Thread 카테고리 제외
      )
      await prisma.aiLifeThread.create({
        data: {
          soulId: updated.soulId,
          type: 'PROJECT',
          title: newThread.title,
          category: newThread.category,
          desire: newThread.desire,
          currentPhase: 0,
        },
      })
    }
  }

  return {
    id: updated.id,
    type: updated.type as 'PROJECT' | 'LIFE_EVENT',
    title: updated.title,
    category: updated.category,
    desire: updated.desire,
    currentPhase: updated.currentPhase,
    padState: parsePADState(updated.padState),
    dayCount: updated.dayCount,
    cycleCount: updated.cycleCount,
    lastEventSummary: updated.lastEventSummary,
    startedAt: updated.startedAt,
  }
}

/**
 * Life Event 일일 판정을 수행합니다.
 * 이미 오늘 판정했으면 스킵합니다.
 */
export async function checkDailyLifeEvent(soulId: string): Promise<ActiveThread | null> {
  const soul = await prisma.aiSoul.findUnique({
    where: { id: soulId },
    select: { lifeEventCheckedAt: true },
  })

  // 오늘 이미 판정했으면 스킵
  if (soul?.lifeEventCheckedAt && isAlreadyCheckedToday(soul.lifeEventCheckedAt)) {
    return null
  }

  // 이미 활성 Life Event가 있는지 확인
  const activeEvent = await prisma.aiLifeThread.findFirst({
    where: { soulId, type: 'LIFE_EVENT', isActive: true },
  })

  // 판정
  const result = rollLifeEvent(!!activeEvent)

  // 판정 시각 업데이트
  await prisma.aiSoul.update({
    where: { id: soulId },
    data: { lifeEventCheckedAt: new Date() },
  })

  if (!result.triggered || !result.event) return null

  // 새 Life Event Thread 생성
  const thread = await prisma.aiLifeThread.create({
    data: {
      soulId,
      type: 'LIFE_EVENT',
      title: result.event.title,
      category: result.event.category,
      padState: result.event.padImpact as unknown as Record<string, number>,
      currentPhase: 0,
    },
  })

  return {
    id: thread.id,
    type: 'LIFE_EVENT',
    title: thread.title,
    category: thread.category,
    desire: null,
    currentPhase: 0,
    padState: parsePADState(thread.padState),
    dayCount: 0,
    cycleCount: 1,
    lastEventSummary: null,
    startedAt: thread.startedAt,
  }
}

/**
 * Thread의 lastEventSummary를 업데이트합니다 (포스팅 후 호출).
 */
export async function updateThreadSummary(threadId: string, summary: string): Promise<void> {
  await prisma.aiLifeThread.update({
    where: { id: threadId },
    data: { lastEventSummary: summary.slice(0, 100) },
  })
}

/**
 * 시드 데이터로 초기 Thread 3개를 생성합니다 (테스트/온보딩용).
 */
export async function seedInitialThreads(
  soulId: string,
  threads: Array<{
    title: string
    category: string
    desire?: string
    phase?: number
    type?: string
  }>,
): Promise<void> {
  for (const t of threads) {
    await prisma.aiLifeThread.create({
      data: {
        soulId,
        type: t.type ?? 'PROJECT',
        title: t.title,
        category: t.category,
        desire: t.desire ?? null,
        currentPhase: t.phase ?? 0,
      },
    })
  }
}

// ─── v2: Thread 자동 교체 풀 ──────────────────────────────────

/** 직업별 Thread 후보 풀 */
const THREAD_POOL: Record<string, Array<{ title: string; category: string; desire: string }>> = {
  '학생': [
    { title: '토익 점수 도전', category: 'LEARNING', desire: '목표 점수 달성' },
    { title: '개인 프로젝트 시작', category: 'CREATIVE', desire: '학기 내 완성' },
    { title: '독서 챌린지', category: 'LEARNING', desire: '한 달 4권 읽기' },
    { title: '운동 습관 만들기', category: 'HEALTH', desire: '주 3회 운동' },
    { title: '동아리 활동', category: 'SOCIAL', desire: '토론 대회 출전' },
  ],
  '개발자/엔지니어': [
    { title: '사이드 프로젝트', category: 'CREATIVE', desire: 'MVP 완성' },
    { title: '새 기술 스택 학습', category: 'LEARNING', desire: '공식 문서 완독' },
    { title: '오픈소스 기여', category: 'CAREER', desire: 'PR 머지 1건' },
    { title: '체력 관리 루틴', category: 'HEALTH', desire: '주 3회 운동' },
    { title: '기술 블로그 운영', category: 'CREATIVE', desire: '월 2개 포스팅' },
  ],
  '교육자': [
    { title: '수업 자료 개선', category: 'CAREER', desire: '학생 참여도 향상' },
    { title: '독서 모임', category: 'LEARNING', desire: '월 1권 완독' },
    { title: '운동 습관', category: 'HEALTH', desire: '매일 30분 걷기' },
    { title: '수업 영상 촬영', category: 'CREATIVE', desire: '유튜브 채널 개설' },
    { title: '학부모 상담 노트 정리', category: 'CAREER', desire: '상담 패턴 데이터화' },
  ],
  '자영업자': [
    { title: '신메뉴 개발', category: 'CREATIVE', desire: '신메뉴 3종 출시' },
    { title: 'SNS 마케팅 도전', category: 'CAREER', desire: '팔로워 1000명' },
    { title: '체력 관리', category: 'HEALTH', desire: '주 2회 운동' },
    { title: '매출 분석 공부', category: 'LEARNING', desire: '엑셀 분석 스킬 습득' },
    { title: '단골 감사 이벤트', category: 'SOCIAL', desire: '월 1회 이벤트 개최' },
  ],
  '사무직/회사원': [
    { title: '자격증 도전', category: 'LEARNING', desire: '시험 합격' },
    { title: '팀 프로젝트 리드', category: 'CAREER', desire: '성공적 마무리' },
    { title: '아침 러닝 도전', category: 'HEALTH', desire: '30일 연속 러닝' },
    { title: '취미 클래스 등록', category: 'HOBBY', desire: '요리/사진/그림 한 가지 배우기' },
    { title: '부서 이동 적응', category: 'SOCIAL', desire: '새 팀원들과 친해지기' },
  ],
}

/** 관심사 태그 기반 Thread 후보 */
const INTEREST_THREAD_MAP: Record<string, Array<{ title: string; category: string; desire: string }>> = {
  '운동': [{ title: '운동 루틴 만들기', category: 'HEALTH', desire: '주 3회 운동 습관화' }],
  '독서': [{ title: '독서 마라톤', category: 'LEARNING', desire: '월 3권 읽기' }],
  '요리': [{ title: '레시피 도전', category: 'CREATIVE', desire: '새 레시피 5개 도전' }],
  '음악': [{ title: '악기 연습', category: 'HOBBY', desire: '매일 30분 연습' }],
  '여행': [{ title: '여행 계획 세우기', category: 'HOBBY', desire: '다음 여행지 리서치' }],
  '그림': [{ title: '드로잉 챌린지', category: 'CREATIVE', desire: '매일 스케치 1장' }],
  '사진': [{ title: '사진 포트폴리오', category: 'CREATIVE', desire: '포트폴리오 30장 완성' }],
  '게임': [{ title: '게임 실력 향상', category: 'HOBBY', desire: '랭크 승급' }],
  '글쓰기': [{ title: '글쓰기 루틴', category: 'CREATIVE', desire: '주 2회 에세이 작성' }],
}

/**
 * v2: 다음 Thread 후보를 선택합니다.
 * 직업별 풀 + 관심사 태그 기반으로 선택, 직전 Thread와 다른 카테고리 우선.
 */
function pickNextThread(
  occupation: string,
  interestTags: string[],
  excludeCategory?: string,
): { title: string; category: string; desire: string } {
  // 1. 관심사 태그 기반 후보 수집 (30% 확률)
  if (Math.random() < 0.3 && interestTags.length > 0) {
    const tag = interestTags[Math.floor(Math.random() * interestTags.length)]
    const candidates = INTEREST_THREAD_MAP[tag]
    if (candidates && candidates.length > 0) {
      const filtered = excludeCategory
        ? candidates.filter((c) => c.category !== excludeCategory)
        : candidates
      if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)]
      }
    }
  }

  // 2. 직업별 풀에서 선택
  const pool = THREAD_POOL[occupation] || THREAD_POOL['사무직/회사원']
  const filtered = excludeCategory
    ? pool.filter((t) => t.category !== excludeCategory)
    : pool
  const candidates = filtered.length > 0 ? filtered : pool

  return candidates[Math.floor(Math.random() * candidates.length)]
}
