/**
 * [Need-Drive 시스템]
 * 욕구(Need) 감소/증가 알고리즘 기반 행동 결정.
 * LLM에 행동을 맡기지 않고, 확정적 알고리즘으로 결정.
 *
 * 설계 출처: docs/2_AI_은하_설계/12_뉴런_알고리즘_설계서_v1.md §6
 * v2 확장: 성격별 Need 증가율 차등화 (설계서 v2 §6)
 */

import type { PADState } from './padEmotionEngine'

// ─── 타입 ────────────────────────────────────────────────────

export interface NeedState {
  expressionNeed: number  // 0.0~1.0 글쓰기 욕구
  socialNeed: number      // 0.0~1.0 교류 욕구
  reflectionNeed: number  // 0.0~1.0 성찰 욕구
  restNeed: number        // 0.0~1.0 휴식 욕구
}

/** v2: 성격 점수 (UserPersona 스키마 필드명과 일치) */
export interface PersonaNeedModifier {
  score_e_i: number   // 0~100, 높을수록 E(외향)
  score_t_f: number   // 0~100, 높을수록 F(감정)
  score_s_n: number   // 0~100, 높을수록 N(직관)
}

export type NeedAction =
  | 'POST_MOMENT'   // expression → Thread/DailyNoise 포스팅
  | 'COMMENT'       // social → 댓글 (50%)
  | 'PING'          // social → 핑 (30%)
  | 'TOUCH'         // social → 터치 (20%)
  | 'REFLECT'       // reflection → 회고 포스팅
  | 'REST'          // rest > 0.8 → 행동 안 함

export interface NeedDecision {
  action: NeedAction
  dominantNeed: keyof NeedState
  needValue: number
}

// ─── 상수 ────────────────────────────────────────────────────

/** heartbeat당 기본 증가율 */
const BASE_RATES: Record<keyof NeedState, number> = {
  expressionNeed: 0.01,
  socialNeed: 0.008,
  reflectionNeed: 0.005,
  restNeed: 0.003,
}

/** 행동 후 소모량 */
const CONSUMPTION: Record<NeedAction, Partial<NeedState>> = {
  POST_MOMENT:  { expressionNeed: -0.5, restNeed: 0.1 },
  COMMENT:      { socialNeed: -0.4, restNeed: 0.05 },
  PING:         { socialNeed: -0.3, restNeed: 0.03 },
  TOUCH:        { socialNeed: -0.2, restNeed: 0.02 },
  REFLECT:      { reflectionNeed: -0.6, expressionNeed: -0.2 },
  REST:         { restNeed: -0.8, expressionNeed: 0.1, socialNeed: 0.05 },
}

/** 시간대 보정 계수 */
const TIME_MULTIPLIERS: Record<string, number> = {
  MORNING: 1.5,    // 6~9시
  DAY: 0.5,        // 10~17시
  EVENING: 1.2,    // 18~22시
  NIGHT: 0.3,      // 23~5시
}

/** 행동 임계값 — 이 이상이면 행동 */
const ACTION_THRESHOLD = 0.4

/** socialNeed 세분화 비율 (설계서 §6: COMMENT 50%, PING 30%, TOUCH 20%) */
const SOCIAL_ACTION_WEIGHTS = [
  { action: 'COMMENT' as NeedAction, weight: 0.50 },
  { action: 'PING' as NeedAction, weight: 0.30 },
  { action: 'TOUCH' as NeedAction, weight: 0.20 },
]

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * heartbeat 시 Need 증가를 적용합니다.
 *
 * @param currentNeed 현재 욕구 상태
 * @param hour 현재 시각 (0~23)
 * @param pad 현재 감정 상태 (감정 부스트 적용)
 * @param persona v2: 성격별 증가율 보정
 */
export function tickNeed(
  currentNeed: NeedState,
  hour: number,
  pad?: PADState,
  persona?: PersonaNeedModifier,
): NeedState {
  const timeMul = getTimeMultiplier(hour)
  const emotionBoost = pad ? getEmotionBoost(pad) : 0
  const personalityMod = persona ? getPersonalityRateModifier(persona) : null

  return clampNeeds({
    expressionNeed: currentNeed.expressionNeed
      + (BASE_RATES.expressionNeed * timeMul)
      + emotionBoost
      + (personalityMod?.expressionNeed ?? 0),
    socialNeed: currentNeed.socialNeed
      + (BASE_RATES.socialNeed * timeMul)
      + (personalityMod?.socialNeed ?? 0),
    reflectionNeed: currentNeed.reflectionNeed
      + (BASE_RATES.reflectionNeed * timeMul)
      + (personalityMod?.reflectionNeed ?? 0),
    restNeed: currentNeed.restNeed + BASE_RATES.restNeed,
  })
}

/**
 * 가장 높은 욕구에 따라 행동을 결정합니다.
 * 4대 욕구 중 임계값(ACTION_THRESHOLD)을 초과하는 지배적 욕구를 선택하며,
 * 특히 소셜 욕구(socialNeed)가 지배적일 때는 COMMENT(50%), PING(30%), TOUCH(20%) 가중치 룰렛에 따라 결정합니다.
 */
export function decideAction(need: NeedState): NeedDecision {
  const needsList: { key: keyof NeedState; val: number }[] = [
    { key: 'expressionNeed', val: need.expressionNeed },
    { key: 'socialNeed', val: need.socialNeed },
    { key: 'reflectionNeed', val: need.reflectionNeed },
    { key: 'restNeed', val: need.restNeed },
  ];

  // 가장 높은 욕구(Dominant Need) 탐색
  let dominant = needsList[0];
  for (let i = 1; i < needsList.length; i++) {
    if (needsList[i].val > dominant.val) {
      dominant = needsList[i];
    }
  }

  // 임계값(0.4) 미만일 경우 휴식(REST)으로 처리하여 행동 유예
  if (dominant.val < ACTION_THRESHOLD) {
    return {
      action: 'REST',
      dominantNeed: dominant.key,
      needValue: dominant.val,
    };
  }

  let action: NeedAction = 'REST';
  if (dominant.key === 'expressionNeed') {
    action = 'POST_MOMENT';
  } else if (dominant.key === 'reflectionNeed') {
    action = 'REFLECT';
  } else if (dominant.key === 'restNeed') {
    action = 'REST';
  } else if (dominant.key === 'socialNeed') {
    // 소셜 가중 랜덤 룰렛 휠 선택
    const roll = Math.random();
    let cumulative = 0;
    for (const item of SOCIAL_ACTION_WEIGHTS) {
      cumulative += item.weight;
      if (roll <= cumulative) {
        action = item.action;
        break;
      }
    }
  }

  return {
    action,
    dominantNeed: dominant.key,
    needValue: dominant.val,
  };
}

/**
 * 행동 실행 후 Need를 소모합니다.
 */
export function consumeNeed(current: NeedState, action: NeedAction): NeedState {
  const delta = CONSUMPTION[action]
  return clampNeeds({
    expressionNeed: current.expressionNeed + (delta.expressionNeed ?? 0),
    socialNeed: current.socialNeed + (delta.socialNeed ?? 0),
    reflectionNeed: current.reflectionNeed + (delta.reflectionNeed ?? 0),
    restNeed: current.restNeed + (delta.restNeed ?? 0),
  })
}

/**
 * 초기 NeedState를 생성합니다.
 */
export function createInitialNeedState(): NeedState {
  return { expressionNeed: 0.6, socialNeed: 0.5, reflectionNeed: 0.4, restNeed: 0 }
}

// ─── 유틸리티 ────────────────────────────────────────────────

function getTimeMultiplier(hour: number): number {
  if (hour >= 6 && hour < 10) return TIME_MULTIPLIERS.MORNING
  if (hour >= 10 && hour < 18) return TIME_MULTIPLIERS.DAY
  if (hour >= 18 && hour < 23) return TIME_MULTIPLIERS.EVENING
  return TIME_MULTIPLIERS.NIGHT
}

/** 감정 변화 시 표현 욕구 부스트 (Arousal > 0.3이면 부스트) */
function getEmotionBoost(pad: PADState): number {
  if (Math.abs(pad.A) > 0.3) return 0.3  // 즉시 부스트
  return 0
}

function clampNeeds(need: NeedState): NeedState {
  return {
    expressionNeed: Math.max(0, Math.min(1, need.expressionNeed)),
    socialNeed: Math.max(0, Math.min(1, need.socialNeed)),
    reflectionNeed: Math.max(0, Math.min(1, need.reflectionNeed)),
    restNeed: Math.max(0, Math.min(1, need.restNeed)),
  }
}

/**
 * v2: 성격에 따른 Need 증가율 보정.
 * 학술 근거: OCEAN Extraversion→사회적 보상 추구, Neuroticism→감정 표현 빈도.
 */
function getPersonalityRateModifier(persona: PersonaNeedModifier): Partial<NeedState> {
  return {
    // 외향적(E)일수록 socialNeed 증가율 ↑
    socialNeed: (persona.score_e_i - 50) * 0.0001,
    // 감정형(F)일수록 expressionNeed 증가율 ↑
    expressionNeed: (persona.score_t_f - 50) * 0.0001,
    // 내향+직관(IN)일수록 reflectionNeed 증가율 ↑
    reflectionNeed: (100 - persona.score_e_i + persona.score_s_n) * 0.00005,
  }
}
