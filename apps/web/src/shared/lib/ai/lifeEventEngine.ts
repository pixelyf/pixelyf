/**
 * [Life Event 엔진]
 * 확률 기반 일시적 인생 이벤트 발생.
 * 하루 1회 판정 — heartbeat마다 판정하면 확률 폭증하므로 반드시 일일 1회.
 *
 * 설계 출처: docs/2_AI_은하_설계/12_뉴런_알고리즘_설계서_v1.md §3.5
 */

// ─── 타입 ────────────────────────────────────────────────────

export interface LifeEventTemplate {
  category: string
  title: string
  weight: number
  duration: { min: number; max: number } // 일
  padImpact: { P: number; A: number; D: number }
}

export interface LifeEventResult {
  triggered: boolean
  event?: LifeEventTemplate
}

// ─── 이벤트 테이블 ──────────────────────────────────────────

const LIFE_EVENT_TABLE: LifeEventTemplate[] = [
  // RELATIONSHIP (7%)
  { category: 'RELATIONSHIP', title: '친한 사람과 다툼',       weight: 1.0, duration: { min: 3, max: 7 }, padImpact: { P: -0.5, A: 0.4, D: -0.3 } },
  { category: 'RELATIONSHIP', title: '뜻밖의 연락',           weight: 2.0, duration: { min: 1, max: 3 }, padImpact: { P: 0.3, A: 0.3, D: 0 } },
  { category: 'RELATIONSHIP', title: '외로움이 밀려옴',       weight: 3.0, duration: { min: 2, max: 5 }, padImpact: { P: -0.3, A: -0.2, D: -0.3 } },
  { category: 'RELATIONSHIP', title: '가까운 사람에 대한 실망', weight: 1.0, duration: { min: 3, max: 7 }, padImpact: { P: -0.4, A: 0.2, D: -0.2 } },

  // CONDITION (6%)
  { category: 'CONDITION', title: '번아웃 징후',      weight: 0.5, duration: { min: 5, max: 14 }, padImpact: { P: -0.4, A: -0.6, D: -0.4 } },
  { category: 'CONDITION', title: '무기력한 날',      weight: 2.0, duration: { min: 1, max: 3 },  padImpact: { P: -0.2, A: -0.5, D: -0.3 } },
  { category: 'CONDITION', title: '몸이 아프다',      weight: 1.0, duration: { min: 2, max: 5 },  padImpact: { P: -0.3, A: -0.3, D: -0.4 } },
  { category: 'CONDITION', title: '에너지 폭발 하루', weight: 2.0, duration: { min: 1, max: 2 },  padImpact: { P: 0.4, A: 0.5, D: 0.3 } },
  { category: 'CONDITION', title: '계절 변화 영향',   weight: 0.5, duration: { min: 3, max: 7 },  padImpact: { P: -0.1, A: -0.2, D: 0 } },

  // TURNING (5.5%)
  { category: 'TURNING', title: '작은 깨달음',       weight: 3.0, duration: { min: 1, max: 3 }, padImpact: { P: 0.4, A: 0.2, D: 0.3 } },
  { category: 'TURNING', title: '뜻밖의 행운',       weight: 1.0, duration: { min: 1, max: 2 }, padImpact: { P: 0.5, A: 0.4, D: 0.2 } },
  { category: 'TURNING', title: '포기하기로 결정',    weight: 0.5, duration: { min: 2, max: 5 }, padImpact: { P: -0.3, A: -0.3, D: -0.5 } },
  { category: 'TURNING', title: '방향을 틀기로 함',   weight: 1.0, duration: { min: 2, max: 5 }, padImpact: { P: 0.1, A: 0.3, D: 0.2 } },

  // SOCIAL_PRESS (6%)
  { category: 'SOCIAL_PRESS', title: 'SNS에서 비교 열등감', weight: 2.0, duration: { min: 1, max: 3 }, padImpact: { P: -0.4, A: 0.2, D: -0.4 } },
  { category: 'SOCIAL_PRESS', title: '인정받지 못함',       weight: 1.0, duration: { min: 2, max: 5 }, padImpact: { P: -0.3, A: 0.1, D: -0.5 } },
  { category: 'SOCIAL_PRESS', title: '뜻밖의 칭찬',         weight: 2.0, duration: { min: 1, max: 2 }, padImpact: { P: 0.5, A: 0.3, D: 0.3 } },
  { category: 'SOCIAL_PRESS', title: '나이/미래에 대한 압박', weight: 1.0, duration: { min: 2, max: 5 }, padImpact: { P: -0.3, A: 0.2, D: -0.3 } },

  // INNER (6%)
  { category: 'INNER', title: '존재적 불안',     weight: 2.0, duration: { min: 2, max: 5 }, padImpact: { P: -0.3, A: 0.3, D: -0.4 } },
  { category: 'INNER', title: '감사한 순간',     weight: 3.0, duration: { min: 1, max: 2 }, padImpact: { P: 0.5, A: -0.1, D: 0.2 } },
  { category: 'INNER', title: '향수/추억에 잠김', weight: 1.0, duration: { min: 1, max: 3 }, padImpact: { P: 0.1, A: -0.3, D: -0.1 } },
  { category: 'INNER', title: '성장을 자각함',   weight: 1.0, duration: { min: 1, max: 2 }, padImpact: { P: 0.4, A: 0.1, D: 0.4 } },
]

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 하루 1회 Life Event 발생을 판정합니다.
 *
 * @param hasActiveEvent 이미 활성 이벤트가 있는지
 * @param random 0~1 난수 (테스트 주입 가능)
 * @returns 발생 여부 + 이벤트 정보
 */
export function rollLifeEvent(
  hasActiveEvent: boolean,
  random?: number,
): LifeEventResult {
  // 이미 활성 이벤트 진행 중이면 판정 생략
  if (hasActiveEvent) {
    return { triggered: false }
  }

  const r = random ?? Math.random()
  const totalWeight = LIFE_EVENT_TABLE.reduce((sum, e) => sum + e.weight, 0)

  // 일일 발생 확률 ≈ 15% (대부분의 날은 평범하다)
  if (r > 0.15) {
    return { triggered: false }
  }

  // 가중치 기반 이벤트 선택
  const eventRandom = Math.random()
  let cumulative = 0
  for (const event of LIFE_EVENT_TABLE) {
    cumulative += event.weight / totalWeight
    if (eventRandom < cumulative) {
      return { triggered: true, event }
    }
  }

  // 폴백
  return { triggered: true, event: LIFE_EVENT_TABLE[0] }
}

/**
 * 이벤트 지속 기간을 결정합니다 (일 단위).
 */
export function rollEventDuration(event: LifeEventTemplate): number {
  const { min, max } = event.duration
  return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * 오늘 이미 판정했는지 확인합니다.
 */
export function isAlreadyCheckedToday(lastChecked: Date | null): boolean {
  if (!lastChecked) return false
  const today = new Date()
  return (
    lastChecked.getFullYear() === today.getFullYear() &&
    lastChecked.getMonth() === today.getMonth() &&
    lastChecked.getDate() === today.getDate()
  )
}
