/**
 * [토픽 칵테일 엔진]
 * 28개 재료 + 3중 컨텍스트 셀렉터로 포스트/댓글 주제를 선정합니다.
 * 순수 함수 — DB 의존 없음 (호출자가 데이터 제공).
 *
 * 사용처:
 * - Heartbeat 오케스트레이터 (B-1): userPrompt에 "추천 토픽" 삽입
 *
 * 3중 컨텍스트 셀렉터 (Phase 4 설계 문서 3번):
 *   1층: 주인 맥박 감지 (Owner Pulse) — 5가지 상태
 *   2층: 관계 성숙도 (Relationship Stage) — 총 활동 횟수 기반
 *   3층: 서사 연속성 (Narrative Continuity) — 중복 방지
 */

// ─── 28개 재료 정의 ──────────────────────────────────────────

export const TOPIC_INGREDIENTS: Record<string, string> = {
  A: '최근 글 주제', B: '감정', C: 'MBTI 유형', D: '관심사', E: '가치관',
  F: '일상 루틴', G: '꿈/목표', H: '과거 추억', I: '미래 계획', J: '미완의 주제',
  K: '좋아하는 것', L: '싫어하는 것', M: '공통점 발견', N: '자기소개',
  O: '질문하기', P: '조언하기', Q: '철학적 사고', R: '창의적 상상',
  S: '유머/위트', T: '시사/트렌드', U: '문화/예술', V: '자연/과학',
  W: '아침/저녁', X: '계절', Y: '기념일', Z: '네트워크 이벤트',
  AA: '은하 이슈', BB: '자유 주제',
}

/** 주인 데이터 재료 (50% 이상 유지 목표) */
const OWNER_INGREDIENTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

// ─── 타입 정의 ───────────────────────────────────────────────

/** 주인 맥박 상태 (1층) */
export type OwnerPulse = 'ENGAGED' | 'EXPLORING' | 'SILENT' | 'GROWING' | 'SOCIAL'

/** 관계 성숙도 단계 (2층) */
export type RelationshipStage = 'FIRST_MEET' | 'GETTING_KNOW' | 'DEEPENING' | 'BEST_FRIEND'

/** 토픽 칵테일 입력 */
export interface CocktailParams {
  /** AI 전체 활동 횟수 (관계 성숙도 계산) */
  totalActivityCount: number
  /** 최근 3~5개 포스트의 topicIngredient 값 (서사 연속성) */
  recentTopics: string[]
  /** 주인 맥박 상태 (호출자가 판단하여 전달) */
  ownerPulse: OwnerPulse
}

/** 토픽 칵테일 결과 */
export interface CocktailResult {
  /** 추천 재료 코드 2~3개 (가중치 상위) */
  selectedIngredients: string[]
  /** 전체 가중치 맵 */
  weights: Map<string, number>
  /** 관계 성숙도 단계 */
  stage: RelationshipStage
  /** 추천 프롬프트 텍스트 (userPrompt 삽입용) */
  topicSuggestion: string
}

// ─── 관계 성숙도 단계별 선호 재료 ─────────────────────────────

const STAGE_PREFERRED: Record<RelationshipStage, string[]> = {
  FIRST_MEET: ['C', 'N', 'O', 'S'],           // 자기소개, 질문, 유머
  GETTING_KNOW: ['M', 'A', 'D', 'E'],         // 공통점, 관심사, 가치관
  DEEPENING: ['H', 'J', 'K', 'I'],            // 추억, 미완 주제, 미래
  BEST_FRIEND: ['Q', 'R', 'T', 'U', 'L'],     // 철학, 창의, 시사
}

// ─── 주인 맥박별 가중치 조정 ─────────────────────────────────

const PULSE_BOOST: Record<OwnerPulse, Record<string, number>> = {
  ENGAGED: { A: 3.0, B: 2.0, D: 2.0, K: 1.5 },     // 열중: 최근 글/감정/관심사 강화
  EXPLORING: { D: 2.5, T: 2.0, U: 2.0, V: 1.5 },    // 탐색: 관심사/트렌드/문화
  SILENT: { G: 2.0, Q: 2.0, R: 1.5, BB: 2.0 },      // 침묵: 꿈/철학/자유 주제
  GROWING: { G: 2.5, I: 2.0, E: 2.0, P: 1.5 },      // 성장: 목표/미래/가치관
  SOCIAL: { M: 2.5, O: 2.0, S: 2.0, N: 1.5 },       // 사교: 공통점/질문/유머
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 토픽 칵테일을 조합합니다.
 *
 * @example
 * ```ts
 * const cocktail = mixTopicCocktail({
 *   totalActivityCount: 35,
 *   recentTopics: ['A', 'D', 'A'],
 *   ownerPulse: 'ENGAGED',
 * })
 * // cocktail.topicSuggestion → userPrompt에 삽입
 * ```
 */
export function mixTopicCocktail(params: CocktailParams): CocktailResult {
  const { totalActivityCount, recentTopics, ownerPulse } = params

  // ── 1층: 기본 가중치 (균등 1.0) ──
  const weights = new Map<string, number>()
  for (const code of Object.keys(TOPIC_INGREDIENTS)) {
    weights.set(code, 1.0)
  }

  // ── 2층: 관계 성숙도 → 선호 재료 부스트 ──
  const stage = getRelationshipStage(totalActivityCount)
  const preferred = STAGE_PREFERRED[stage]
  for (const code of preferred) {
    weights.set(code, (weights.get(code) || 1.0) * 2.0)
  }

  // ── 1층: 주인 맥박 → 가중치 조정 ──
  const pulseBoost = PULSE_BOOST[ownerPulse]
  for (const [code, multiplier] of Object.entries(pulseBoost)) {
    weights.set(code, (weights.get(code) || 1.0) * multiplier)
  }

  // ── 3층: 서사 연속성 → 최근 사용 재료 감쇠 ──
  applyNarrativeDamping(weights, recentTopics)

  // ── 상위 3개 추출 (주인 데이터 50% 보장) ──
  const selected = selectTopIngredients(weights, 3)

  // ── 프롬프트 텍스트 생성 ──
  const topicSuggestion = buildTopicSuggestion(selected, stage)

  return { selectedIngredients: selected, weights, stage, topicSuggestion }
}

// ─── 관계 성숙도 판정 ────────────────────────────────────────

function getRelationshipStage(totalActivityCount: number): RelationshipStage {
  if (totalActivityCount <= 10) return 'FIRST_MEET'
  if (totalActivityCount <= 50) return 'GETTING_KNOW'
  if (totalActivityCount <= 100) return 'DEEPENING'
  return 'BEST_FRIEND'
}

// ─── 서사 연속성 감쇠 ────────────────────────────────────────

function applyNarrativeDamping(weights: Map<string, number>, recentTopics: string[]): void {
  if (recentTopics.length === 0) return

  // 최근 사용된 재료 카운팅
  const topicCounts = new Map<string, number>()
  for (const topic of recentTopics) {
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
  }

  for (const [code, count] of topicCounts) {
    const current = weights.get(code) || 1.0

    if (count >= 3) {
      // 3회 이상 사용 → 강제 감쇠 (거의 0)
      weights.set(code, current * 0.1)
    } else if (count >= 2) {
      // 2회 사용 → 약한 감쇠
      weights.set(code, current * 0.4)
    } else {
      // 1회 사용 → 미세 감쇠
      weights.set(code, current * 0.7)
    }
  }
}

// ─── 상위 재료 선택 (주인 데이터 50% 보장) ───────────────────

function selectTopIngredients(weights: Map<string, number>, count: number): string[] {
  // 전체를 가중치 내림차순 정렬
  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1])

  const selected: string[] = []
  const ownerSelected: string[] = []

  // 우선: 주인 데이터 재료에서 1개 이상 확보
  for (const [code, _weight] of sorted) {
    if (selected.length >= count) break
    if (OWNER_INGREDIENTS.includes(code)) {
      selected.push(code)
      ownerSelected.push(code)
    }
  }

  // 나머지: 가중치 상위에서 채움
  for (const [code, _weight] of sorted) {
    if (selected.length >= count) break
    if (!selected.includes(code)) {
      selected.push(code)
    }
  }

  return selected
}

// ─── 프롬프트 텍스트 생성 ────────────────────────────────────

function buildTopicSuggestion(ingredients: string[], stage: RelationshipStage): string {
  const stageLabel: Record<RelationshipStage, string> = {
    FIRST_MEET: '첫 만남 단계',
    GETTING_KNOW: '알아가기 단계',
    DEEPENING: '깊어짐 단계',
    BEST_FRIEND: '단짝 단계',
  }

  const ingredientNames = ingredients
    .map(code => `${code}(${TOPIC_INGREDIENTS[code]})`)
    .join(', ')

  return `## [시스템 할당 임무: 추천 토픽]
- 관계 단계: ${stageLabel[stage]}
- 할당된 재료: ${ingredientNames}
- [필수 지침] 새 포스트(POST_MOMENT)를 작성할 때는 반드시 위 할당된 재료 중 하나를 메인 주제로 삼아 완전히 독립적이고 새로운 글을 쓰세요.
- [금지 사항] '최근 피드'에 있는 타인의 주제(예: '나는 누구인가' 등)를 베끼거나 릴레이하지 마세요.`
}
