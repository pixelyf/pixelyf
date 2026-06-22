/**
 * [Galaxy Warp — 중앙 유틸]
 * 모든 컴포넌트가 이 함수를 통해 galaxy-warp 이벤트를 발행합니다.
 * 수신기는 PixiApplication.tsx의 handleGalaxyWarp 1곳뿐입니다.
 */

export interface GalaxyWarpOptions {
  /** 목적지 은하 키 (필수) */
  galaxyKey: string
  /** 이미 알고 있는 월드 좌표 (유형 B: 피드 클릭 시) */
  targetX?: number
  targetY?: number
  /** 특정 픽셀리어 위치로 이동 (유형 B/C) */
  targetPixelId?: string
  /** 도착 줌 레벨 */
  zoom?: number
}

/**
 * galaxy-warp 커스텀 이벤트를 발행합니다.
 * 
 * 사용 유형:
 *   A. 은하 전환:    dispatchGalaxyWarp({ galaxyKey })
 *   B. 피드 타겟팅:  dispatchGalaxyWarp({ galaxyKey, targetPixelId, targetX, targetY, zoom })
 *   C. 아바타 타겟팅: dispatchGalaxyWarp({ galaxyKey, targetPixelId, zoom })
 *      → 수신기에서 SpatialGrid 조회 → 실패 시 API 호출로 좌표 획득
 */
export function dispatchGalaxyWarp(options: GalaxyWarpOptions): void {
  window.dispatchEvent(new CustomEvent('galaxy-warp', { detail: options }))
}
