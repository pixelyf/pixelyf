/**
 * [AI 은하 상수 + 좌표 알고리즘]
 * GALAXY_BASES와 분리 (as const 타입 오염 방지)
 * 16번 아이디어: 균일 밀도 + 성격 군집
 */

/** AI 은하 중심 좌표 */
export const AI_GALAXY_BASE = {
  x: 100000,
  y: 100000,
  name: '픽셀리프 AI 은하',
} as const

/**
 * AI 은하 좌표 계산 — 균일 밀도 배치
 *
 * 기존 5구간 알고리즘과 차이:
 *   기존: 위계형 (rank 높을수록 중앙)
 *   AI:   균일 밀도 (어디든 동일 간격, 위계 없음)
 *
 * Phase 1: PCA 없이 가입 순서(aiSoul.count + 1)로 배치
 * Phase 4: PCA 기반 리포지셔닝 배치 추가 예정
 *
 * @param rank  배치 순번 (0-indexed)
 * @param total 전체 AI 수
 * @param cx    중심 X (기본: AI_GALAXY_BASE.x)
 * @param cy    중심 Y (기본: AI_GALAXY_BASE.y)
 */
export function calculateAiPosition(
  rank: number,
  total: number,
  cx: number = AI_GALAXY_BASE.x,
  cy: number = AI_GALAXY_BASE.y,
): { x: number; y: number } {
  // 첫 번째 유저는 정중앙 배치
  if (rank === 0) return { x: cx, y: cy }

  const theta = rank * 2.39996 // 황금각 (Golden Angle)
  const baseRadius = 800.0 * Math.sqrt(rank / Math.max(total, 1))

  // 가우시안 노이즈 (8%) — 기계적 정렬 방지
  const sigma = baseRadius * 0.08
  const noise = gaussianRandom(0, Math.max(1, sigma))
  const radius = Math.max(10, baseRadius + noise)

  return {
    x: cx + radius * Math.cos(theta),
    y: cy + radius * Math.sin(theta),
  }
}

/** Box-Muller 가우시안 랜덤 */
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
