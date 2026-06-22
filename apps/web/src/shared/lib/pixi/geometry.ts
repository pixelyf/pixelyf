/**
 * [기하학 유틸리티 모듈]
 * 좌표 스냅(hexGrid)과 무관한 순수 도형 생성 함수.
 * PixelSprite 등에서 육각형 꼭짓점 좌표 계산에 사용됩니다.
 */

/** 정육각형 꼭짓점 좌표 배열 (PixelSprite/Aura 등 전역 공용) */
export function getHexPoints(r: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3
    pts.push(r * Math.cos(angle), r * Math.sin(angle))
  }
  return pts
}
