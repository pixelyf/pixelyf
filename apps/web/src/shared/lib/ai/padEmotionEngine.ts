/**
 * [PAD 감정 엔진]
 * Mehrabian PAD 3D 감정 모델 기반 감정 좌표 연산.
 * 순수 함수 — DB 의존 없음.
 *
 * P(Pleasure): -1.0(불쾌) ~ 1.0(쾌)
 * A(Arousal):  -1.0(무기력) ~ 1.0(흥분)
 * D(Dominance): -1.0(복종) ~ 1.0(지배)
 *
 * 설계 출처: docs/2_AI_은하_설계/12_뉴런_알고리즘_설계서_v1.md §4
 * v2 확장: Appraisal Engine 연동 (설계서 v2 §4.3)
 */

// ─── 타입 ────────────────────────────────────────────────────

export interface PADState {
  P: number
  A: number
  D: number
}

/** 서사 Phase별 PAD 변화 벡터 */
export interface PhaseEmotion {
  label: string
  occEmotion: string
  delta: PADState
}

// ─── 상수: Phase별 PAD 변화 테이블 ────────────────────────────

/** Project Thread 10단계 + 실패 분기 */
const PROJECT_PHASE_EMOTIONS: Record<number, PhaseEmotion> = {
  0:  { label: 'SEED',      occEmotion: '희망',       delta: { P: 0.2, A: 0.2, D: 0 } },
  1:  { label: 'START',     occEmotion: '기쁨+불안',  delta: { P: 0.2, A: 0.4, D: -0.2 } },
  2:  { label: 'WALL',      occEmotion: '좌절',       delta: { P: -0.3, A: 0.2, D: -0.4 } },
  3:  { label: 'DOUBT',     occEmotion: '후회',       delta: { P: -0.4, A: -0.2, D: -0.3 } },
  // 실패 분기
  30: { label: 'FAILURE',   occEmotion: '절망',       delta: { P: -0.6, A: -0.2, D: -0.5 } },
  31: { label: 'GRIEF',     occEmotion: '자책',       delta: { P: -0.5, A: -0.4, D: -0.4 } },
  32: { label: 'REST',      occEmotion: '무기력→안도', delta: { P: 0, A: -0.6, D: 0 } },
  // 성공 경로
  4:  { label: 'SMALL_WIN', occEmotion: '자부심',     delta: { P: 0.4, A: 0.2, D: 0.4 } },
  5:  { label: 'HABIT',     occEmotion: '만족',       delta: { P: 0.2, A: -0.2, D: 0.2 } },
  6:  { label: 'SLUMP',     occEmotion: '지루함',     delta: { P: 0, A: -0.4, D: -0.2 } },
  7:  { label: 'BREAK',     occEmotion: '놀라움',     delta: { P: 0.3, A: 0.4, D: 0.2 } },
  8:  { label: 'MASTERY',   occEmotion: '자부심',     delta: { P: 0.4, A: -0.2, D: 0.4 } },
  9:  { label: 'CLOSURE',   occEmotion: '감사',       delta: { P: 0.3, A: -0.4, D: 0.2 } },
}

/** Life Event 5단계 */
const LIFE_EVENT_PHASE_EMOTIONS: Record<number, PhaseEmotion> = {
  0: { label: 'TRIGGER', occEmotion: '충격/놀람', delta: { P: -0.3, A: 0.5, D: -0.3 } },
  1: { label: 'IMMERSE', occEmotion: '몰입',     delta: { P: -0.2, A: 0.2, D: -0.2 } },
  2: { label: 'TURN',    occEmotion: '전환',     delta: { P: 0.1, A: 0, D: 0.1 } },
  3: { label: 'RESOLVE', occEmotion: '해소',     delta: { P: 0.3, A: -0.3, D: 0.2 } },
  4: { label: 'GROW',    occEmotion: '성장',     delta: { P: 0.4, A: -0.2, D: 0.3 } },
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 현재 PAD 상태에 Phase 변화를 적용합니다.
 * 값은 항상 [-1, 1] 범위로 클램핑됩니다.
 */
export function applyPhaseEmotion(
  current: PADState,
  phase: number,
  threadType: 'PROJECT' | 'LIFE_EVENT',
): PADState {
  const table = threadType === 'PROJECT' ? PROJECT_PHASE_EMOTIONS : LIFE_EVENT_PHASE_EMOTIONS
  const emotion = table[phase]
  if (!emotion) return current

  return clampPAD({
    P: current.P + emotion.delta.P,
    A: current.A + emotion.delta.A,
    D: current.D + emotion.delta.D,
  })
}

/**
 * 성격(MBTI 10축)에 따른 PAD 초기값을 생성합니다.
 *
 * @param persona 10축 점수 (0~100)
 */
export function initPADFromPersona(persona: {
  e_i: number
  s_n: number
  t_f: number
  j_p: number
  calm_vibrant: number
  yolo_future: number
}): PADState {
  return clampPAD({
    // E(외향)일수록 P↑, F(감정)일수록 P↑
    P: ((persona.e_i - 50) * 0.004) + ((persona.t_f - 50) * 0.004),
    // E(외향)일수록 A↑, vibrant(역동)일수록 A↑
    A: ((persona.e_i - 50) * 0.006) + ((persona.calm_vibrant - 50) * 0.004),
    // J(계획)일수록 D↑, yolo(미래)일수록 D↑
    D: ((persona.j_p - 50) * -0.004) + ((persona.yolo_future - 50) * 0.004),
  })
}

/**
 * PAD 상태에서 감정 라벨을 추출합니다 (댓글 시나리오 참고용).
 */
export function getPADLabel(pad: PADState): string {
  if (pad.P > 0.3 && pad.A > 0.3) return '기쁨/흥분'
  if (pad.P > 0.3 && pad.A <= 0) return '만족/평온'
  if (pad.P < -0.3 && pad.A > 0.3) return '분노/좌절'
  if (pad.P < -0.3 && pad.A <= -0.3) return '무기력/슬픔'
  if (pad.P < -0.3) return '불안/불쾌'
  if (pad.A < -0.5) return '무기력'
  return '중립'
}

/**
 * 두 PAD 상태의 감정 거리 (유클리드)를 계산합니다.
 */
export function padDistance(a: PADState, b: PADState): number {
  return Math.sqrt(
    (a.P - b.P) ** 2 + (a.A - b.A) ** 2 + (a.D - b.D) ** 2,
  )
}

/**
 * PAD 변화량의 크기 (Arousal 변화 감지용).
 */
export function padMagnitude(pad: PADState): number {
  return Math.sqrt(pad.P ** 2 + pad.A ** 2 + pad.D ** 2)
}

// ─── v2: Appraisal 연동 ──────────────────────────────────────

/**
 * Phase 고정 delta + Appraisal modifier + 에너지 영향을 합산합니다.
 * 설계서 v2 §4.3: 최종 PAD = Phase delta + Appraisal + Energy
 */
export function applyAppraisalModifier(
  current: PADState,
  appraisalMod: PADState,
  energyImpact?: number,
): PADState {
  const energyPAD: PADState = {
    P: 0,
    A: (energyImpact ?? 0) * 0.3, // 에너지가 낮으면 Arousal 감소
    D: (energyImpact ?? 0) * 0.2,
  }

  return clampPAD({
    P: current.P + appraisalMod.P + energyPAD.P,
    A: current.A + appraisalMod.A + energyPAD.A,
    D: current.D + appraisalMod.D + energyPAD.D,
  })
}

// ─── Phase 정보 조회 ─────────────────────────────────────────

export function getPhaseLabel(phase: number, type: 'PROJECT' | 'LIFE_EVENT'): string {
  const table = type === 'PROJECT' ? PROJECT_PHASE_EMOTIONS : LIFE_EVENT_PHASE_EMOTIONS
  return table[phase]?.label ?? 'UNKNOWN'
}

export function getPhaseEmotion(phase: number, type: 'PROJECT' | 'LIFE_EVENT'): string {
  const table = type === 'PROJECT' ? PROJECT_PHASE_EMOTIONS : LIFE_EVENT_PHASE_EMOTIONS
  return table[phase]?.occEmotion ?? '중립'
}

// ─── 유틸리티 ────────────────────────────────────────────────

function clampPAD(pad: PADState): PADState {
  return {
    P: Math.max(-1, Math.min(1, pad.P)),
    A: Math.max(-1, Math.min(1, pad.A)),
    D: Math.max(-1, Math.min(1, pad.D)),
  }
}

/** JSON에서 PAD 상태를 안전하게 파싱 */
export function parsePADState(json: unknown): PADState {
  if (json && typeof json === 'object' && 'P' in json && 'A' in json && 'D' in json) {
    const obj = json as Record<string, unknown>
    return clampPAD({
      P: typeof obj.P === 'number' ? obj.P : 0,
      A: typeof obj.A === 'number' ? obj.A : 0,
      D: typeof obj.D === 'number' ? obj.D : 0,
    })
  }
  return { P: 0, A: 0, D: 0 }
}
