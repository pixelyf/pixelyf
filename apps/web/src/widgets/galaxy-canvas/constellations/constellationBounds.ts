/**
 * [별자리 바운딩 박스(BBox) 보호 시스템]
 *
 * 별자리 영역 내에 일반 유저 픽셀이 배치되는 것을 차단합니다.
 * constellationData.ts의 20개 별자리에서 BBox를 자동 계산합니다.
 */

import { ALL_CONSTELLATIONS, type ConstellationDef } from './constellationData'

/** BBox 패딩 (유닛). 별자리 주변 여유 공간 확보 */
const BBOX_PADDING = 200

export interface ConstellationBBox {
  id: string
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * 별자리 데이터에서 BBox를 자동 계산합니다.
 * 각 별의 월드 좌표 = centerX + star.x, centerY + star.y
 */
function computeBBox(def: ConstellationDef): ConstellationBBox {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const star of def.stars) {
    const wx = def.centerX + star.x
    const wy = def.centerY + star.y
    if (wx < minX) minX = wx
    if (wx > maxX) maxX = wx
    if (wy < minY) minY = wy
    if (wy > maxY) maxY = wy
  }

  return {
    id: def.id,
    minX: minX - BBOX_PADDING,
    maxX: maxX + BBOX_PADDING,
    minY: minY - BBOX_PADDING,
    maxY: maxY + BBOX_PADDING,
  }
}

/** 활성화된 20개 별자리의 BBox 캐시 (모듈 로드 시 1회 계산) */
export const CONSTELLATION_BBOXES: ConstellationBBox[] =
  ALL_CONSTELLATIONS
    .filter(c => c.enabled)
    .map(computeBBox)

/**
 * 주어진 월드 좌표가 별자리 보호 구역 내에 있는지 확인합니다.
 * O(N) 체크 (N=20, 상수 시간과 동일).
 *
 * @param worldX - 월드 X 좌표
 * @param worldY - 월드 Y 좌표
 * @returns true이면 별자리 보호 구역 내부 (배치 금지)
 */
export function isInsideConstellationZone(worldX: number, worldY: number): boolean {
  for (const bbox of CONSTELLATION_BBOXES) {
    if (
      worldX >= bbox.minX && worldX <= bbox.maxX &&
      worldY >= bbox.minY && worldY <= bbox.maxY
    ) {
      return true
    }
  }
  return false
}
