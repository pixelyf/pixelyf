import { useMemo } from 'react'
import { MOODS, LEGACY_ID_MAP } from '@/shared/constants/moods'
import { useGalaxyStore } from '@/stores/galaxyStore'

export function useMoodColor(moodId?: string | null) {
  // [NEW] 활성 픽셀 판넬 주인의 생각 상태 구독
  const activePanelMoodId = useGalaxyStore(s => s.activePanelMoodId)
  // [NEW] 로그인 유저 본인의 현재 생각 상태 구독 (가로채기 감지용)
  const currentMoodId = useGalaxyStore(s => s.currentMoodId)

  return useMemo(() => {
    // [NEW] 팝업 생각 상태 컬러 가로채기 스마트 가드 정밀 보정:
    // 훅 호출 시 전달받은 moodId가 누락되었거나 본인의 무드 ID(currentMoodId)와 동일할 경우이고,
    // 활성화된 타인의 픽셀 판넬 무드(activePanelMoodId)가 셋팅되어 있다면 자동으로 타인 무드를 강제 주입합니다.
    const isCurrentUserMood = !moodId || moodId === currentMoodId
    const resolvedId = (isCurrentUserMood && activePanelMoodId) ? activePanelMoodId : (moodId || null)

    // 1. moodId에 매칭되는 Mood 찾기 (레거시 호환 맵 적용, 없으면 기본 중립을 반환)
    const effectiveId = resolvedId ? (LEGACY_ID_MAP[resolvedId] || resolvedId) : resolvedId
    const mood = MOODS.find(m => m.id === effectiveId) || MOODS[MOODS.length - 1] // 기본 'neutral'
    
    // 2. HEX 변환
    const primaryHex = '#' + mood.primaryColor.toString(16).padStart(6, '0')
    const deepHex = '#' + mood.deepColor.toString(16).padStart(6, '0')
    const lightHex = '#' + mood.lightColor.toString(16).padStart(6, '0')
    
    // 3. RGB 문자열 (r, g, b) 형태로 변환 (Tailwind rgba(...)용)
    const toRgbStr = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result 
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
        : '129, 140, 248'
    }

    const themeRgb = toRgbStr(primaryHex)
    const themeRgbDeep = toRgbStr(deepHex)
    const themeRgbLight = toRgbStr(lightHex)

    // Dynamic Contrast Inversion (다크/라이트 가역 스위칭 제거 - 통일된 다크 테마 일관성 유지)
    const isNeutral = mood.id === 'neutral'

    const textPrimary = 'rgba(255, 255, 255, 0.95)'
    const textSecondary = 'rgba(255, 255, 255, 0.65)'
    const textMuted = 'rgba(255, 255, 255, 0.45)'
    const borderTheme = 'rgba(255, 255, 255, 0.1)'
    const cardBgTheme = 'rgba(255, 255, 255, 0.05)'
    const cardBgHover = 'rgba(255, 255, 255, 0.08)'
    const cardBgActive = 'rgba(255, 255, 255, 0.12)'
    const btnSolidBg = 'rgba(255, 255, 255, 0.95)'
    const btnSolidText = 'black'

    return {
      mood,
      primaryHex,
      deepHex,
      lightHex,
      secondaryHex: deepHex, // 하위 호환을 위해 secondaryHex에 deepHex 할당
      themeRgb,
      themeRgbDeep,
      themeRgbLight,
      isNeutral,
      // React inline style 용 객체
      themeStyle: {
        '--theme-rgb': themeRgb,
        '--theme-rgb-deep': themeRgbDeep,
        '--theme-rgb-light': themeRgbLight,
        '--theme-bg': deepHex,
        '--theme-text-primary': textPrimary,
        '--theme-text-secondary': textSecondary,
        '--theme-text-muted': textMuted,
        '--theme-border': borderTheme,
        '--theme-card-bg': cardBgTheme,
        '--theme-card-bg-hover': cardBgHover,
        '--theme-card-bg-active': cardBgActive,
        '--theme-btn-solid-bg': btnSolidBg,
        '--theme-btn-solid-text': btnSolidText,
      } as React.CSSProperties
    }
  }, [moodId, activePanelMoodId, currentMoodId])
}
