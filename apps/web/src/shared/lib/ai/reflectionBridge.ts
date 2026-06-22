/**
 * [v3 Reflection Bridge]
 * 승격된 장기 기억에서 키워드를 추출하여 새 Thread를 자동 제안합니다.
 * LLM 호출 없이 규칙 기반으로 동작합니다 (비용 0원).
 *
 * 호출 시점: Reflection DEEP 배치 완료 후, promotedCount > 0일 때
 *
 * 로직:
 *   1. 최근 7일 내 승격된 기억 조회
 *   2. promotedCategory별 키워드 클러스터링
 *   3. 기존 활성 Thread와 중복 체크
 *   4. confidence > 0.6이면 자동 생성 권장
 *
 * 설계 출처: docs/2_AI_은하_설계/3_뉴런_알고리즘_설계서_v3_v4.md Part B
 */

import prisma from '@/shared/lib/prisma'
import { buildActiveMemoryWhere } from './memorySemantics'

// ─── 타입 ────────────────────────────────────────────────────

export interface ThreadSuggestion {
  title: string
  category: string
  desire: string
  source: 'MEMORY_KEYWORD'
  confidence: number // 0~1
}

// ─── 상수 ────────────────────────────────────────────────────

/** 승격 기억 조회 범위 (7일) */
const LOOKBACK_DAYS = 7

/** 자동 생성 신뢰도 임계값 */
const AUTO_CREATE_THRESHOLD = 0.6

/** promotedCategory → Thread 카테고리 매핑 */
const CATEGORY_MAP: Record<string, string[]> = {
  IDENTITY: ['REFLECTION', 'CREATIVE'],
  RELATIONSHIP: ['SOCIAL'],
  EVENT: ['CAREER', 'HEALTH', 'HOBBY', 'STUDY'],
}

/** action 키워드 (confidence 보정용) */
const ACTION_KEYWORDS = ['도전', '시작', '배우', '변화', '목표', '계획', '새로운', '처음', '결심', '도약']

/** 카테고리별 Thread 제목 템플릿 */
const TITLE_TEMPLATES: Record<string, string[]> = {
  REFLECTION: [
    '나를 돌아보는 시간',
    '내면의 목소리에 귀 기울이기',
    '조용한 자기 탐색',
  ],
  CREATIVE: [
    '새로운 표현 방식 찾기',
    '창작의 영감 모으기',
    '내 안의 이야기 꺼내기',
  ],
  SOCIAL: [
    '소중한 관계 돌보기',
    '새로운 인연과의 교류',
    '함께하는 시간 늘리기',
  ],
  CAREER: [
    '커리어 다음 단계 준비',
    '새로운 도전 구상',
    '전문성 깊이 더하기',
  ],
  HEALTH: [
    '몸과 마음 챙기기',
    '건강한 루틴 만들기',
    '에너지 회복 프로젝트',
  ],
  HOBBY: [
    '취미의 세계 확장',
    '좋아하는 것에 집중하기',
    '일상의 작은 즐거움',
  ],
  STUDY: [
    '배움의 즐거움 재발견',
    '새로운 분야 탐험',
    '지식의 폭 넓히기',
  ],
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 최근 승격된 기억에서 Thread 자동 제안을 생성합니다.
 *
 * @param soulId AI Soul ID
 * @returns Thread 제안 목록 (confidence 내림차순)
 */
export async function suggestThreadsFromMemory(
  soulId: string,
): Promise<ThreadSuggestion[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  // 1. 최근 승격된 기억 조회
  const promotedMemories = await prisma.aiMemory.findMany({
    where: {
      aiSoulId: soulId,
      memoryStream: { in: ['OWNER', 'SELF'] },
      memoryLayer: 'LONG_TERM',
      isPromoted: true,
      promotedAt: { gte: since },
      ...buildActiveMemoryWhere(),
    },
    select: {
      theme: true,
      promotedCategory: true,
      importanceScore: true,
    },
    orderBy: { importanceScore: 'desc' },
  })

  if (promotedMemories.length === 0) return []

  // 2. promotedCategory별 클러스터링
  const clusters: Record<string, { themes: string[]; avgImportance: number }> = {}

  for (const mem of promotedMemories) {
    const cat = mem.promotedCategory || 'EVENT'
    if (!clusters[cat]) clusters[cat] = { themes: [], avgImportance: 0 }
    clusters[cat].themes.push(mem.theme)
  }

  // 평균 중요도 계산
  for (const cat of Object.keys(clusters)) {
    const mems = promotedMemories.filter(m => (m.promotedCategory || 'EVENT') === cat)
    clusters[cat].avgImportance = mems.reduce((sum, m) => sum + m.importanceScore, 0) / mems.length
  }

  // 3. 기존 활성 Thread 카테고리 조회 (중복 방지)
  const activeThreads = await prisma.aiLifeThread.findMany({
    where: { soulId, isActive: true },
    select: { category: true },
  })
  const activeCategories = new Set(activeThreads.map(t => t.category))

  // 4. 클러스터별 Thread 제안 생성
  const suggestions: ThreadSuggestion[] = []

  for (const [promotedCat, cluster] of Object.entries(clusters)) {
    const targetCategories = CATEGORY_MAP[promotedCat] || ['HOBBY']

    for (const targetCat of targetCategories) {
      // confidence 계산
      let confidence = 0.2 // 기본값

      // 같은 카테고리 승격 3건+
      if (cluster.themes.length >= 3) confidence += 0.3

      // 기존 Thread와 카테고리 비중복
      if (!activeCategories.has(targetCat)) confidence += 0.2

      // theme에 action 키워드 포함
      const hasActionKeyword = cluster.themes.some(theme =>
        ACTION_KEYWORDS.some(kw => theme.includes(kw))
      )
      if (hasActionKeyword) confidence += 0.2

      // importanceScore 평균 ≥ 8
      if (cluster.avgImportance >= 8) confidence += 0.1

      // confidence를 0~1로 클램프
      confidence = Math.min(1.0, confidence)

      // 이미 해당 카테고리 Thread가 있으면 스킵
      if (activeCategories.has(targetCat)) continue

      // 제목 선택
      const templates = TITLE_TEMPLATES[targetCat] || TITLE_TEMPLATES.HOBBY
      const title = templates[Math.floor(Math.random() * templates.length)]

      // 키워드 기반 desire 생성
      const topTheme = cluster.themes[0].slice(0, 50)

      suggestions.push({
        title,
        category: targetCat,
        desire: `${topTheme} — 에서 시작된 새로운 서사`,
        source: 'MEMORY_KEYWORD',
        confidence,
      })
    }
  }

  // confidence 내림차순 정렬
  suggestions.sort((a, b) => b.confidence - a.confidence)

  return suggestions
}

/** 자동 생성 임계값 확인 유틸리티 */
export function shouldAutoCreate(suggestion: ThreadSuggestion): boolean {
  return suggestion.confidence >= AUTO_CREATE_THRESHOLD
}
