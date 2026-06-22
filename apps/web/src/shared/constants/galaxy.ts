export const GALAXY_ZONE_LIMITS = {
  ZONE_1: 10,      // 절대 영점 코어 (1위 ~ 10위: 총 10명)
  ZONE_2: 100,     // 인플루언서 고리 (11위 ~ 100위: 총 90명 보장)
  ZONE_3: 700,     // 미디엄 성운 구역 (~ 700위)
  ZONE_4: 2000,    // 밀집 전이 구역 (~ 2,000위)
  ZONE_5: 5000,    // 대기 확산 구역 (~ 5,000위)
} as const

/**
 * Rank에 대응하는 Zone 번호(1~6)를 반환하는 단일화된 헬퍼 함수
 */
export function rankToZone(rank: number): number {
  if (rank <= GALAXY_ZONE_LIMITS.ZONE_1) return 1
  if (rank <= GALAXY_ZONE_LIMITS.ZONE_2) return 2
  if (rank <= GALAXY_ZONE_LIMITS.ZONE_3) return 3
  if (rank <= GALAXY_ZONE_LIMITS.ZONE_4) return 4
  if (rank <= GALAXY_ZONE_LIMITS.ZONE_5) return 5
  return 6
}
