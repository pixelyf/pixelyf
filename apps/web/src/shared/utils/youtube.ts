/**
 * YouTube 유틸리티 — 프로젝트 전역 공통화
 *
 * 기존 4개 파일(PixelDetailDrawer, SearchFeedDrawer, ImageLightbox, MomentModal)에서
 * 중복 정의되던 YouTube ID 추출 정규식을 단일 모듈로 통합.
 *
 * [js-hoist-regexp] 모듈 레벨 상수로 호이스트 → 함수 호출마다 재생성 방지.
 */

const YT_REGEX =
  /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/

/**
 * YouTube URL에서 비디오 ID를 추출합니다.
 * @param url - YouTube URL 문자열
 * @returns 비디오 ID (11자) 또는 null
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(YT_REGEX)
  return match?.[1] ?? null
}

/**
 * YouTube 비디오 ID로 썸네일 URL을 생성합니다.
 * @param videoId - YouTube 비디오 ID
 * @returns mqdefault (320x180) 썸네일 URL
 */
export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}
