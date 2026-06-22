/**
 * [좌표 변환 + 은하 판별 모듈]
 * PixiApplication.tsx에서 추출된 순수 함수들.
 *
 * [DB 동적화] 은하 중심 좌표를 galaxySystem.ts의 런타임 캐시에서 참조합니다.
 * 하드코딩된 상수 없이 관리자가 추가한 은하도 자동으로 대응합니다.
 */

import { VISUAL_SCALE } from '@/shared/constants/personas'
import { GALAXY_CENTERS, type GalaxyKey } from '@/shared/constants/galaxySystem'

// ── GalaxyDomain: 레거시 호환 alias (Phase 완료 후 점진적 제거) ──────────────
export type GalaxyDomain = GalaxyKey

// Re-export GalaxyKey for convenience
export type { GalaxyKey } from '@/shared/constants/galaxySystem'

// ── 동적 은하 중심점 Re-export ─────────────────────────────────────────
export { GALAXY_CENTERS } from '@/shared/constants/galaxySystem'
export { syncGalaxyCenters } from '@/shared/constants/galaxySystem'

/**
 * [DB 동적화] 엔진 내부 로컬 좌표 → 가장 가까운 은하 판별
 * GALAXY_CENTERS 런타임 캐시를 순회하므로 관리자 추가 은하도 자동 대응.
 */
export function getGalaxyFromCoords(
  localX: number,
  localY: number,
  worldOffsetX: number = 0,
  worldOffsetY: number = 0,
): GalaxyKey {
  const dbX = (localX + worldOffsetX) / VISUAL_SCALE
  const dbY = (localY + worldOffsetY) / VISUAL_SCALE

  let nearest: GalaxyKey = 'PIXELYF'
  let minDist = Infinity
  for (const [key, center] of Object.entries(GALAXY_CENTERS)) {
    const dist = Math.hypot(dbX - center.x, dbY - center.y)
    if (dist < minDist) {
      minDist = dist
      nearest = key as GalaxyKey
    }
  }
  return nearest
}

/**
 * [LEGACY ALIAS] Phase 6에서 기존 호출부 일괄 변경 전까지 런타임 에러 방지용
 */
export function getDomainFromCoords(
  localX: number,
  localY: number,
  worldOffsetX: number = 0,
  worldOffsetY: number = 0,
  partnerCode?: string
): GalaxyDomain {
  return getGalaxyFromCoords(localX, localY, worldOffsetX, worldOffsetY)
}

/**
 * [LEGACY ALIAS]
 */
export function getWorldOffset(galaxyGroup: string): { x: number; y: number } {
  return { x: 0, y: 0 }
}
