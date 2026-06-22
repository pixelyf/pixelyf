/**
 * [디바이스 감지 유틸리티]
 * PixiApplication.tsx에서 추출.
 * 디바이스 성능을 판별하여 렌더링 상한선(DETAILED_CAP)을 결정합니다.
 */

/**
 * 현재 디바이스가 데스크탑인지 판별합니다.
 * UA 문자열을 우선하되, 터치 유무는 고사양 판별 지표로만 활용합니다.
 * (데스크탑도 터치 가능하므로)
 */
export function isDesktopDevice(): boolean {
  if (typeof window === 'undefined') return true
  const ua = navigator.userAgent
  const representsMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  return !representsMobile
}

/**
 * 디바이스 성능에 따른 상세 렌더링 상한선을 반환합니다.
 * - 데스크탑: 10,000 (10K 스프라이트까지 상세 렌더링)
 * - 모바일: 2,000 (2K 스프라이트까지 상세 렌더링)
 */
export function getDetailedCap(): number {
  return isDesktopDevice() ? 10000 : 2000
}
