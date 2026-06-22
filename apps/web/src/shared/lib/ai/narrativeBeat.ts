/**
 * [서사 비트 엔진]
 * Story Circle 기반 Phase 전환 확률 계산.
 * 순수 함수 — DB 의존 없음.
 *
 * 설계 출처: docs/2_AI_은하_설계/12_뉴런_알고리즘_설계서_v1.md §4
 */

// ─── 타입 ────────────────────────────────────────────────────

export interface PhaseTransitionResult {
  newPhase: number
  transitionType: 'ADVANCE' | 'STAY' | 'REGRESS' | 'SKIP' | 'FAILURE'
  label: string
}

interface PersonaModifier {
  /** MBTI E/I 점수 (0~100, 낮을수록 I) */
  e_i: number
  /** MBTI T/F 점수 (0~100, 낮을수록 T) */
  t_f: number
  /** v2: MBTI S/N 점수 (0~100, 높을수록 N 직관) */
  s_n?: number
}

// ─── 상수 ────────────────────────────────────────────────────

/** Project Thread 최대 Phase */
const PROJECT_MAX_PHASE = 9
/** Life Event 최대 Phase */
const LIFE_EVENT_MAX_PHASE = 4

/** Phase 3(DOUBT)에서 실패 분기 확률 */
const FAILURE_BRANCH_RATE = 0.30

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * Project Thread의 Phase 전환을 결정합니다.
 *
 * 기본: 전진 65%, 유지 20%, 역행 10%, 건너뛰기 5%
 * 성격 보정 적용.
 *
 * @param currentPhase 현재 Phase (0~9, 또는 30~32 실패 분기)
 * @param persona 성격 10축 중 E/I, T/F
 * @param random 0~1 난수 (테스트 주입 가능)
 */
export function advanceProjectPhase(
  currentPhase: number,
  persona?: PersonaModifier,
  random?: number,
): PhaseTransitionResult {
  const r = random ?? Math.random()

  // 실패 분기 처리
  if (currentPhase === 30) return { newPhase: 31, transitionType: 'ADVANCE', label: 'FAILURE→GRIEF' }
  if (currentPhase === 31) return { newPhase: 32, transitionType: 'ADVANCE', label: 'GRIEF→REST' }
  if (currentPhase === 32) {
    // REST에서 재시작 또는 SMALL_WIN으로 회복
    return r < 0.6
      ? { newPhase: 0, transitionType: 'ADVANCE', label: 'REST→새 SEED(재시작)' }
      : { newPhase: 4, transitionType: 'ADVANCE', label: 'REST→SMALL_WIN(회복)' }
  }

  // CLOSURE(9)에서는 사이클 완료 → Phase 0으로
  if (currentPhase >= PROJECT_MAX_PHASE) {
    return { newPhase: 0, transitionType: 'ADVANCE', label: 'CLOSURE→새 사이클' }
  }

  // Phase 3(DOUBT)에서 실패 분기 확률
  if (currentPhase === 3) {
    const failRate = adjustFailureRate(FAILURE_BRANCH_RATE, persona)
    if (r < failRate) {
      return { newPhase: 30, transitionType: 'FAILURE', label: 'DOUBT→FAILURE' }
    }
  }

  // 기본 전환 확률 (성격 보정 적용)
  const { advance, stay, regress } = adjustProbabilities(currentPhase, persona)

  if (r < advance) {
    return { newPhase: currentPhase + 1, transitionType: 'ADVANCE', label: `Phase ${currentPhase}→${currentPhase + 1}` }
  }
  if (r < advance + stay) {
    return { newPhase: currentPhase, transitionType: 'STAY', label: `Phase ${currentPhase} 유지` }
  }
  if (r < advance + stay + regress && currentPhase > 0) {
    return { newPhase: currentPhase - 1, transitionType: 'REGRESS', label: `Phase ${currentPhase}→${currentPhase - 1} 역행` }
  }
  // Skip (2단계 전진, 최대 Phase 초과 방지)
  const skipTarget = Math.min(currentPhase + 2, PROJECT_MAX_PHASE)
  return { newPhase: skipTarget, transitionType: 'SKIP', label: `Phase ${currentPhase}→${skipTarget} 건너뛰기` }
}

/**
 * Life Event의 Phase 전환을 결정합니다.
 * Life Event는 항상 전진 (예외: 일시적으로 머무름).
 */
export function advanceLifeEventPhase(
  currentPhase: number,
  random?: number,
): PhaseTransitionResult {
  const r = random ?? Math.random()

  if (currentPhase >= LIFE_EVENT_MAX_PHASE) {
    return { newPhase: currentPhase, transitionType: 'STAY', label: 'GROW 완료 (해소 대기)' }
  }

  // 80% 전진, 20% 유지 (Life Event는 빠르게 진행)
  if (r < 0.80) {
    return { newPhase: currentPhase + 1, transitionType: 'ADVANCE', label: `Event Phase ${currentPhase}→${currentPhase + 1}` }
  }
  return { newPhase: currentPhase, transitionType: 'STAY', label: `Event Phase ${currentPhase} 유지` }
}

// ─── 확률 보정 ───────────────────────────────────────────────

function adjustProbabilities(
  currentPhase: number,
  persona?: PersonaModifier,
): { advance: number; stay: number; regress: number } {
  let advance = 0.65
  let stay = 0.20
  let regress = 0.10
  // skip = 0.05 (나머지)

  if (!persona) return { advance, stay, regress }

  const isIntrovert = persona.e_i < 40
  const isFeeling = persona.t_f > 60

  // IF그룹(내향+감정): 설계서 §4.2
  if (isIntrovert && isFeeling) {
    if (currentPhase === 2) {
      // WALL: 역행 확률 +10% (설계서 원문)
      regress += 0.10
      advance -= 0.10
    }
    if (currentPhase === 3) {
      // DOUBT: 체류 ×2 (설계서 원문)
      stay *= 2  // 0.20 → 0.40
      advance -= 0.15
    }
  }

  // ET그룹(외향+논리): START/SLUMP 빠른 통과 (체류 ×0.5)
  if (!isIntrovert && !isFeeling && (currentPhase === 1 || currentPhase === 6)) {
    stay *= 0.5
    advance += 0.10
  }

  // v2: IN그룹(내향+직관): CLOSURE에서 깊은 성찰 — 체류 확률 증가 (설계서 §4.2)
  const isIntuitive = isIntrovert && (persona.s_n ?? 50) > 60  // 내향 + 직관(N) 경향
  if (isIntuitive && currentPhase === 9) {
    stay += 0.15  // CLOSURE에서 더 오래 머물며 성찰
    advance -= 0.10
  }

  // 정규화 (skip 5% 보존)
  const total = advance + stay + regress
  return {
    advance: advance / total * 0.95,
    stay: stay / total * 0.95,
    regress: regress / total * 0.95,
  }
}

function adjustFailureRate(base: number, persona?: PersonaModifier): number {
  if (!persona) return base
  // IF그룹은 실패 확률 약간 증가 (감정적 취약)
  if (persona.e_i < 40 && persona.t_f > 60) return base + 0.05
  // ET그룹은 실패 확률 감소 (빠른 회복)
  if (persona.e_i > 60 && persona.t_f < 40) return base - 0.10
  return base
}
