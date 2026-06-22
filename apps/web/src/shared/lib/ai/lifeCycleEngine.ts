/**
 * [v4 Life Cycle Engine]
 * 아바타의 생애 주기 전환을 관리합니다.
 * Life Course Theory (Elder 1998) 기반.
 *
 * 전환 조건 (AND):
 *   - 현재 Stage 경과일 ≥ 최소 체류일 (30일)
 *   - Thread 완료 누적 ≥ 3건
 *   - transitionProbability > 0.7
 *
 * 전환 시 자동 처리:
 *   - occupation 업데이트
 *   - 기존 CAREER Thread 자동 완료
 *   - 새로운 Stage 맞춤 Thread 3개 자동 생성
 *
 * 설계 출처: docs/2_AI_은하_설계/3_뉴런_알고리즘_설계서_v3_v4.md Part C
 */

import prisma from '@/shared/lib/prisma'

// ─── 타입 ────────────────────────────────────────────────────

export type LifeStage = 'STUDENT' | 'EARLY_CAREER' | 'MID_CAREER' | 'SENIOR' | 'FREELANCE' | 'RETIRED'

export interface LifeCycleResult {
  transitioned: boolean
  newStage?: LifeStage
  reason?: string
}

// ─── 상수 ────────────────────────────────────────────────────

/** 최소 체류일 (한 Stage에 최소 30일) */
const MIN_STAGE_DAYS = 30

/** Thread 완료 최소 건수 */
const MIN_COMPLETED_THREADS = 3

/** 전환 확률 임계값 */
const TRANSITION_THRESHOLD = 0.7

/** Stage 전환 경로 (다음 가능한 Stage) */
const STAGE_TRANSITIONS: Record<LifeStage, LifeStage[]> = {
  STUDENT: ['EARLY_CAREER', 'FREELANCE'],
  EARLY_CAREER: ['MID_CAREER', 'FREELANCE'],
  MID_CAREER: ['SENIOR', 'FREELANCE'],
  SENIOR: ['RETIRED', 'FREELANCE'],
  FREELANCE: ['EARLY_CAREER', 'MID_CAREER'],
  RETIRED: [], // 최종 단계
}

/** Stage별 기본 직업 매핑 */
const STAGE_OCCUPATIONS: Record<LifeStage, string[]> = {
  STUDENT: ['대학생/대학원생'],
  EARLY_CAREER: ['사무직/회사원', '개발자/엔지니어', '디자이너/크리에이터', '교육자/연구원', '프리랜서/자영업자'],
  MID_CAREER: ['사무직/회사원', '개발자/엔지니어', '교육자/연구원', '마케터/기획자'],
  SENIOR: ['교육자/연구원', '사무직/회사원', '마케터/기획자'],
  FREELANCE: ['프리랜서/자영업자', '디자이너/크리에이터', '콘텐츠 크리에이터'],
  RETIRED: ['은퇴자'],
}

/** Stage별 초기 Thread 템플릿 */
const STAGE_THREADS: Record<LifeStage, Array<{ title: string; category: string; desire: string }>> = {
  STUDENT: [
    { title: '졸업 프로젝트 도전', category: 'STUDY', desire: '마지막 학기를 불태우기' },
    { title: '취업 준비 시작', category: 'CAREER', desire: '원하는 직장 찾기' },
    { title: '동기들과 추억 만들기', category: 'SOCIAL', desire: '함께한 시간을 기록으로 남기기' },
  ],
  EARLY_CAREER: [
    { title: '새 직장 적응기', category: 'CAREER', desire: '프로페셔널로 성장하기' },
    { title: '자기만의 루틴 만들기', category: 'HEALTH', desire: '일과 삶의 균형 찾기' },
    { title: '새로운 인맥 넓히기', category: 'SOCIAL', desire: '업계 네트워크 구축' },
  ],
  MID_CAREER: [
    { title: '리더십 역량 키우기', category: 'CAREER', desire: '팀을 이끄는 사람이 되기' },
    { title: '전문성 깊이 더하기', category: 'STUDY', desire: '분야의 전문가로 인정받기' },
    { title: '취미로 재충전', category: 'HOBBY', desire: '일 외의 삶에서 에너지 찾기' },
  ],
  SENIOR: [
    { title: '멘토링과 지식 전수', category: 'SOCIAL', desire: '후배들에게 경험을 나누기' },
    { title: '인생 2막 준비', category: 'REFLECTION', desire: '다음 챕터를 설계하기' },
    { title: '건강 관리 강화', category: 'HEALTH', desire: '오래도록 건강한 삶' },
  ],
  FREELANCE: [
    { title: '나만의 브랜드 구축', category: 'CAREER', desire: '독립적인 전문가로 서기' },
    { title: '클라이언트 네트워크', category: 'SOCIAL', desire: '안정적인 일감 확보' },
    { title: '자유로운 일상 설계', category: 'REFLECTION', desire: '나답게 사는 법 찾기' },
  ],
  RETIRED: [
    { title: '새로운 취미 발견', category: 'HOBBY', desire: '여유로운 삶을 즐기기' },
    { title: '회고록 쓰기', category: 'CREATIVE', desire: '살아온 이야기를 정리하기' },
    { title: '건강한 노년 만들기', category: 'HEALTH', desire: '활기찬 매일을 보내기' },
  ],
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 생애 주기 전환 조건을 체크하고, 조건 충족 시 자동 전환합니다.
 *
 * @param soulId AI Soul ID
 * @returns 전환 결과
 */
export async function checkLifeCycleTransition(
  soulId: string,
): Promise<LifeCycleResult> {
  // 1. 현재 상태 조회
  const soul = await prisma.aiSoul.findUnique({
    where: { id: soulId },
    select: { userId: true },
  })
  if (!soul) return { transitioned: false }

  const persona = await prisma.userPersona.findUnique({
    where: { user_id: soul.userId },
  })
  if (!persona) return { transitioned: false }

  const currentStage = (persona.life_stage || 'EARLY_CAREER') as LifeStage
  const stageSince = persona.life_stage_since || persona.created_at

  // 2. 가능한 다음 Stage 확인
  const nextStages = STAGE_TRANSITIONS[currentStage]
  if (nextStages.length === 0) return { transitioned: false, reason: 'FINAL_STAGE' }

  // 3. 조건 1: 최소 체류일 체크
  const stageDays = Math.floor((Date.now() - new Date(stageSince).getTime()) / 86400000)
  if (stageDays < MIN_STAGE_DAYS) return { transitioned: false, reason: `STAGE_TOO_SHORT (${stageDays}/${MIN_STAGE_DAYS}d)` }

  // 4. 조건 2: Thread 완료 건수 체크
  const completedThreads = await prisma.aiLifeThread.count({
    where: { soulId, isActive: false, completedAt: { not: null } },
  })
  if (completedThreads < MIN_COMPLETED_THREADS) return { transitioned: false, reason: `THREADS_INCOMPLETE (${completedThreads}/${MIN_COMPLETED_THREADS})` }

  // 5. 조건 3: 전환 확률 계산
  const probability = calculateTransitionProbability(soulId, stageDays, completedThreads)
  if (probability < TRANSITION_THRESHOLD) return { transitioned: false, reason: `PROBABILITY_LOW (${probability.toFixed(2)})` }

  // 6. 다음 Stage 선택 (랜덤)
  const newStage = nextStages[Math.floor(Math.random() * nextStages.length)]

  // 7. 전환 실행
  await executeTransition(soulId, soul.userId, currentStage, newStage)

  console.log(`[LifeCycle] 전환 완료: ${currentStage} → ${newStage} (soulId=${soulId}, days=${stageDays}, prob=${probability.toFixed(2)})`)
  return { transitioned: true, newStage }
}

// ─── 전환 확률 계산 ──────────────────────────────────────────

function calculateTransitionProbability(
  _soulId: string,
  stageDays: number,
  completedThreads: number,
): number {
  // 기본 확률 (체류일이 길수록 증가, 60일에 0.5 도달)
  const dayFactor = Math.min(1, stageDays / 60) * 0.5

  // Thread 완료 보너스 (5건 이상이면 0.3 추가)
  const threadFactor = Math.min(0.3, (completedThreads - MIN_COMPLETED_THREADS) * 0.1)

  // 랜덤 요소 (0~0.2)
  const randomFactor = Math.random() * 0.2

  return Math.min(1, dayFactor + threadFactor + randomFactor)
}

// ─── 전환 실행 ───────────────────────────────────────────────

async function executeTransition(
  soulId: string,
  userId: string,
  _oldStage: LifeStage,
  newStage: LifeStage,
): Promise<void> {
  // 1. CAREER Thread 자동 완료
  await prisma.aiLifeThread.updateMany({
    where: { soulId, category: 'CAREER', isActive: true },
    data: { isActive: false, completedAt: new Date() },
  })

  // 2. 새 직업 배정 (Stage 기본 직업에서 랜덤)
  const occupations = STAGE_OCCUPATIONS[newStage]
  const newOccupation = occupations[Math.floor(Math.random() * occupations.length)]

  // 3. UserPersona 업데이트
  await prisma.userPersona.update({
    where: { user_id: userId },
    data: {
      life_stage: newStage,
      life_stage_since: new Date(),
      occupation: newOccupation,
    },
  })

  // 4. 새 Stage 맞춤 Thread 생성
  const threads = STAGE_THREADS[newStage]
  for (const t of threads) {
    await prisma.aiLifeThread.create({
      data: {
        soulId,
        type: 'PROJECT',
        title: t.title,
        category: t.category,
        desire: t.desire,
      },
    })
  }
}
