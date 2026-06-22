export type LODLevel = 1 | 2 | 3 | 4

export interface LODConfig {
  showAvatarDetail: boolean
  showNickname: boolean
  showGlowAnimation: boolean
  showConnectionLines: boolean
  showSocialTags: boolean
  pixelScale: number
  renderRadiusPx: number
}

export function getLODLevel(zoom: number): LODLevel {
  if (zoom >= 0.4) return 1 // Full: 아바타 + 닉네임 + 핑 위성 + 모먼트
  if (zoom >= 0.15) return 2 // 아바타 표시 (이 시점부터 클릭 가능)
  if (zoom >= 0.03) return 3 // 글로우 애니메이션 + 코어 색상
  return 4                  // 별빛 점만 (렌더 최소화)
}

export const LOD_CONFIG: Record<LODLevel, LODConfig> = {
  1: {
    showAvatarDetail: true,
    showNickname: true,
    showGlowAnimation: true,
    showConnectionLines: true,
    showSocialTags: true,
    pixelScale: 0.333, // 1.0 / 3.0
    renderRadiusPx: 300,
  },
  2: {
    showAvatarDetail: true,   // [NEW] 아바타 조기 노출
    showNickname: true,       // [FIX] 스파인/아바타 노출 시점에 텍스트/뱃지도 함께 노출
    showGlowAnimation: true,
    showConnectionLines: false,
    showSocialTags: false,
    pixelScale: 0.333,
    renderRadiusPx: 500,
  },
  3: {
    showAvatarDetail: false,
    showNickname: false,
    showGlowAnimation: true,
    showConnectionLines: false,
    showSocialTags: false,
    pixelScale: 0.333,
    renderRadiusPx: 700,
  },
  4: {
    showAvatarDetail: false,
    showNickname: false,
    showGlowAnimation: true,
    showConnectionLines: false,
    showSocialTags: false,
    pixelScale: 0.333,
    renderRadiusPx: 1000,
  },
}
