/**
 * [Galaxy System — Dynamic DB-Driven Architecture]
 *
 * 모든 은하/카테고리 데이터는 DB(Galaxy / GalaxyCategory 모델)에서 조회하며,
 * 프론트엔드는 useGalaxySystem() 훅을 통해 동적으로 소비합니다.
 *
 * 이 파일은 다음만 제공합니다:
 *   1. GalaxyKey 타입 (string alias — 관리자가 은하를 추가하면 자동 대응)
 *   2. 런타임 갤럭시 센터 캐시 (엔진 / coordinate.ts 등 비-React 모듈에서 사용)
 *
 * ⚠️ 하드코딩 금지: 관리자에서 은하가 추가되면 반영되어야 합니다.
 */

// ── 은하 키 타입 (동적 — DB에서 관리) ──────────────────────────────────
export type GalaxyKey = string

// ── 엔진 레벨 은하 중심 좌표 캐시 ──────────────────────────────────────
// coordinate.ts, PixiApplication.tsx 등 비-React 모듈에서 참조합니다.
// PixiApplication 초기화 시 useGalaxySystem() 데이터로 동기화합니다.
export const GALAXY_CENTERS: Record<string, { x: number; y: number }> = {}

/**
 * API 데이터(useGalaxySystem)로부터 은하 중심 좌표 캐시를 동기화합니다.
 * PixiApplication 마운트 시 1회 호출됩니다.
 */
export function syncGalaxyCenters(
  galaxies: { key: string; centerX: number; centerY: number }[]
) {
  // 기존 키 클리어 (삭제된 은하 반영)
  for (const k of Object.keys(GALAXY_CENTERS)) {
    delete GALAXY_CENTERS[k]
  }
  for (const g of galaxies) {
    GALAXY_CENTERS[g.key] = { x: g.centerX, y: g.centerY }
  }
}

/**
 * [FALLBACK] 앱 최초 로드 시 API 응답 전에 엔진이 참조할 기본값.
 * useGalaxySystem 데이터가 도착하면 syncGalaxyCenters()로 덮어씁니다.
 * 운영 시 관리자 추가 은하는 자동으로 반영됩니다.
 */
function initFallbackCenters() {
  if (Object.keys(GALAXY_CENTERS).length === 0) {
    GALAXY_CENTERS['PIXELYF'] = { x: 0, y: 0 }
  }
}
initFallbackCenters()
