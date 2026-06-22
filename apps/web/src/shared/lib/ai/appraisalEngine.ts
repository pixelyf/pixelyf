/**
 * [Appraisal Engine]
 * 상황 평가 → PAD modifier 계산.
 * v2 신규 모듈 — OCC Appraisal Theory 기반 규칙 엔진.
 * 순수 함수, DB 의존 없음.
 *
 * "이 상황이 내 목표에 도움인가 방해인가?"를 판정하여
 * PAD delta를 맥락 의존적으로 조정합니다.
 *
 * 설계 출처: 뉴런 알고리즘 설계서 v2 §4
 * 학술 근거: OCC (Ortony, Clore & Collins, 1988) + MLD-EA (ACL 2024)
 */

import type { PADState } from './padEmotionEngine'
import type { TimeBlock } from './dailyTemplateData'

// ─── 타입 ────────────────────────────────────────────────────

export interface AppraisalInput {
  /** Thread 카테고리 (HEALTH, CREATIVE, CAREER, SOCIAL, LEARNING, DAILY, SELF 등) */
  threadCategory: string
  /** Thread 현재 Phase */
  threadPhase: number
  /** 날씨 (microScenarioGenerator에서 생성) */
  weather?: string
  /** 컨디션 */
  condition?: string
  /** 사건 */
  incident?: string
  /** 현재 시간 블록 */
  currentBlock?: TimeBlock
  /** 누적 에너지 */
  cumulativeEnergy?: number
}

export interface AppraisalResult {
  /** 목표 일치도: -1.0(방해) ~ +1.0(도움) */
  goalCongruence: number
  /** PAD 추가 보정 */
  padModifier: PADState
  /** 시나리오에 추가할 맥락 힌트 */
  narrativeHint: string
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 현재 상황을 평가하여 PAD modifier를 계산합니다.
 * 규칙 기반 — LLM 미사용.
 */
export function appraise(input: AppraisalInput): AppraisalResult {
  let goalCongruence = 0
  const padMod: PADState = { P: 0, A: 0, D: 0 }
  const hints: string[] = []

  // 1. 날씨 × 카테고리 평가
  if (input.weather) {
    const weatherEffect = evaluateWeather(input.weather, input.threadCategory)
    goalCongruence += weatherEffect.congruence
    addPAD(padMod, weatherEffect.pad)
    if (weatherEffect.hint) hints.push(weatherEffect.hint)
  }

  // 2. 컨디션 평가
  if (input.condition) {
    const condEffect = evaluateCondition(input.condition, input.threadCategory)
    goalCongruence += condEffect.congruence
    addPAD(padMod, condEffect.pad)
    if (condEffect.hint) hints.push(condEffect.hint)
  }

  // 3. 사건 × Phase 평가
  if (input.incident) {
    const incEffect = evaluateIncident(input.incident, input.threadPhase)
    goalCongruence += incEffect.congruence
    addPAD(padMod, incEffect.pad)
    if (incEffect.hint) hints.push(incEffect.hint)
  }

  // 4. 시간 블록 × 카테고리 평가 (활동 적합성)
  if (input.currentBlock) {
    const blockEffect = evaluateBlockFit(input.currentBlock, input.threadCategory)
    goalCongruence += blockEffect.congruence
    addPAD(padMod, blockEffect.pad)
    if (blockEffect.hint) hints.push(blockEffect.hint)
  }

  // 5. 누적 에너지 평가
  if (input.cumulativeEnergy !== undefined) {
    const energyEffect = evaluateEnergy(input.cumulativeEnergy)
    addPAD(padMod, energyEffect.pad)
    if (energyEffect.hint) hints.push(energyEffect.hint)
  }

  // goalCongruence clamp
  goalCongruence = Math.max(-1, Math.min(1, goalCongruence))

  return {
    goalCongruence,
    padModifier: clampPAD(padMod),
    narrativeHint: hints.join(' '),
  }
}

// ─── 평가 규칙 ───────────────────────────────────────────────

interface RuleResult {
  congruence: number
  pad: PADState
  hint: string
}

function evaluateWeather(weather: string, category: string): RuleResult {
  // HEALTH 카테고리(러닝, 운동 등)에 비/눈 = 방해
  if (['HEALTH', '건강/운동'].some((c) => category.includes(c))) {
    if (weather.includes('비')) {
      return { congruence: -0.5, pad: { P: -0.2, A: -0.1, D: -0.1 }, hint: '비 때문에 운동 계획이 위협받고 있다' }
    }
    if (weather.includes('눈')) {
      return { congruence: -0.3, pad: { P: -0.1, A: 0, D: -0.1 }, hint: '눈길 조심해야 해서 외출이 꺼려진다' }
    }
    if (weather.includes('폭염') || weather.includes('한파')) {
      return { congruence: -0.4, pad: { P: -0.2, A: -0.2, D: -0.1 }, hint: '극한 날씨가 야외 활동을 막고 있다' }
    }
    if (weather.includes('맑')) {
      return { congruence: 0.3, pad: { P: 0.1, A: 0.1, D: 0 }, hint: '날씨가 좋아 의욕이 올라간다' }
    }
  }

  // CREATIVE 카테고리에 비 = 도움 (비 오는 날 창작 분위기)
  if (['CREATIVE', '창작/예술'].some((c) => category.includes(c))) {
    if (weather.includes('비')) {
      return { congruence: 0.2, pad: { P: 0.1, A: -0.1, D: 0.1 }, hint: '빗소리가 창작 분위기를 돋운다' }
    }
  }

  return { congruence: 0, pad: { P: 0, A: 0, D: 0 }, hint: '' }
}

function evaluateCondition(condition: string, category: string): RuleResult {
  if (condition.includes('피곤') || condition.includes('안 좋')) {
    // 모든 카테고리에서 부정적
    const base: RuleResult = {
      congruence: -0.3,
      pad: { P: -0.1, A: -0.2, D: -0.1 },
      hint: '컨디션이 좋지 않아 집중하기 어렵다',
    }
    // HEALTH 카테고리는 더 큰 영향
    if (['HEALTH', '건강/운동'].some((c) => category.includes(c))) {
      base.congruence = -0.5
      base.hint = '몸이 안 좋은데 운동을 해야 하는 갈등'
    }
    return base
  }
  if (condition.includes('좋음')) {
    return { congruence: 0.2, pad: { P: 0.1, A: 0.1, D: 0.1 }, hint: '' }
  }
  return { congruence: 0, pad: { P: 0, A: 0, D: 0 }, hint: '' }
}

function evaluateIncident(incident: string, phase: number): RuleResult {
  if (!incident) return { congruence: 0, pad: { P: 0, A: 0, D: 0 }, hint: '' }

  const isDoubt = phase === 3 || phase === 30 || phase === 31 // 위기 Phase들
  const isPositive = incident.includes('좋은') || incident.includes('발견')
  const isNegative = incident.includes('실수') || incident.includes('나쁜')

  if (isPositive && isDoubt) {
    // 위기 중 좋은 소식 = 큰 긍정 반전
    return { congruence: 0.5, pad: { P: 0.3, A: 0.2, D: 0.2 }, hint: '포기하려던 순간 예상치 못한 좋은 소식' }
  }
  if (isPositive) {
    return { congruence: 0.3, pad: { P: 0.2, A: 0.1, D: 0.1 }, hint: '' }
  }
  if (isNegative && isDoubt) {
    // 위기 중 나쁜 소식 = 절망 심화
    return { congruence: -0.5, pad: { P: -0.3, A: -0.1, D: -0.3 }, hint: '설상가상이다' }
  }
  if (isNegative) {
    return { congruence: -0.3, pad: { P: -0.2, A: 0.1, D: -0.1 }, hint: '' }
  }

  return { congruence: 0, pad: { P: 0, A: 0, D: 0 }, hint: '' }
}

function evaluateBlockFit(block: TimeBlock, category: string): RuleResult {
  // HOBBY/REST 블록에서 CREATIVE/LEARNING 카테고리 = 유리
  if ((block.category === 'HOBBY' || block.category === 'REST') &&
      ['CREATIVE', 'LEARNING', '창작/예술', '자기계발'].some((c) => category.includes(c))) {
    return { congruence: 0.3, pad: { P: 0.1, A: 0.1, D: 0.1 }, hint: '온전히 집중할 수 있는 자유시간' }
  }

  // WORK 블록에서 CAREER/LEARNING = 자연스러움
  if (block.category === 'WORK' &&
      ['CAREER', '커리어', '자기계발'].some((c) => category.includes(c))) {
    return { congruence: 0.2, pad: { P: 0, A: 0, D: 0.1 }, hint: '' }
  }

  // WORK 블록에서 HOBBY 카테고리 = 부조화
  if (block.category === 'WORK' &&
      ['HOBBY', '취미', '여가'].some((c) => category.includes(c))) {
    return { congruence: -0.2, pad: { P: -0.1, A: 0, D: -0.1 }, hint: '일하는 중에 취미 생각이 자꾸 난다' }
  }

  return { congruence: 0, pad: { P: 0, A: 0, D: 0 }, hint: '' }
}

function evaluateEnergy(cumulativeEnergy: number): { pad: PADState; hint: string } {
  if (cumulativeEnergy <= -0.4) {
    return { pad: { P: -0.1, A: -0.2, D: -0.1 }, hint: '체력이 바닥나고 있다' }
  }
  if (cumulativeEnergy <= -0.2) {
    return { pad: { P: -0.05, A: -0.1, D: 0 }, hint: '' }
  }
  if (cumulativeEnergy >= 0.3) {
    return { pad: { P: 0.1, A: 0.1, D: 0.1 }, hint: '' }
  }
  return { pad: { P: 0, A: 0, D: 0 }, hint: '' }
}

// ─── 유틸리티 ────────────────────────────────────────────────

function addPAD(target: PADState, delta: PADState): void {
  target.P += delta.P
  target.A += delta.A
  target.D += delta.D
}

function clampPAD(pad: PADState): PADState {
  return {
    P: Math.max(-1, Math.min(1, pad.P)),
    A: Math.max(-1, Math.min(1, pad.A)),
    D: Math.max(-1, Math.min(1, pad.D)),
  }
}
