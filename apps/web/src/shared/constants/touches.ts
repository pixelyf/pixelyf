// Touch(터치) 시스템 상수
// 유저→유저 경량 관심 신호 (피드 유무 무관)

/** 터치 1회당 glow_score 부스트 (핑의 +2보다 낮은 경량 기여) */
export const TOUCH_GLOW_BOOST = 1

/** 동일 대상에 대한 터치 쿨다운 (밀리초) — 프로덕션: 12시간 */
export const TOUCH_COOLDOWN_MS = 12 * 60 * 60 * 1000

/** 쿨다운 시간 (초 단위 — API 서버 사이드 검증용) */
export const TOUCH_COOLDOWN_SECONDS = 12 * 60 * 60

/** 터치 UI 텍스트 */
export const TOUCH_UI = {
  buttonLabel: '✋ 터치',
  sentMessage: '관심의 파동을 전송했습니다',
  cooldownMessage: '잠시 후 다시 터치할 수 있습니다',
  noFeedPrompt: '이 존재에 관심을 표현해보세요',
  statLabel: '받은 터치',
} as const
