'use client'

import { useCallback } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useToastStore } from '@/stores/toastStore'
import { dispatchGalaxyWarp, GalaxyWarpOptions } from '@/shared/utils/galaxyWarp'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { type GalaxyKey } from '@/shared/constants/galaxySystem'
import { stripLocalePrefix } from '@/shared/lib/i18n/stripLocalePrefix'

/**
 * 동적 은하 네비게이션 훅 (URL 동기화 포함)
 * 
 * 캔버스 이동(Warp)과 브라우저 주소창(URL)을 동기화하여
 * 새로고침 시에도 사용자가 선택한 은하/카테고리가 유지되도록 합니다.
 */
export function useGalaxyNavigation() {
  const { getGalaxyByKey } = useGalaxySystem()

  /**
   * 은하 및 카테고리로 이동합니다.
   * @param galaxyKey 이동할 은하 식별자 (예: 'PIXELYF_CORE')
   * @param categoryKey 선택할 카테고리 식별자 (선택사항)
   * @param warpOptions Warp 애니메이션 옵션 (타겟 픽셀 지정 등)
   */
  const navigateToGalaxy = useCallback(async (
    galaxyKey: string,
    categoryKey: string | null = null,
    warpOptions?: Omit<GalaxyWarpOptions, 'galaxyKey'>
  ) => {
    const galaxy = getGalaxyByKey(galaxyKey)
    if (!galaxy) {
      console.warn(`[useGalaxyNavigation] Galaxy not found for key: ${galaxyKey}`)
      return
    }

    // ── [Phase 3] 네비게이션 가드: 은하 참여(좌표) 여부 확인 ──
    const user = useUserStore.getState().user
    if (user) {
      try {
        const res = await fetch(`/api/galaxies/check?galaxyKey=${galaxyKey}`)
        if (!res.ok) {
          useToastStore.getState().addToast({ type: 'error', title: '에러', message: '은하 상태를 확인할 수 없습니다.' })
          return
        }
        
        const data = await res.json()
        
        if (!data.joined) {
          useGalaxyStore.getState().setPendingJoinGalaxyKey(galaxyKey)
          useGalaxyStore.getState().setIsJoinModalOpen(true)
          return
        }
      } catch (error) {
        console.error('[useGalaxyNavigation] Check join failed:', error)
        useToastStore.getState().addToast({ type: 'error', title: '에러', message: '네트워크 오류가 발생했습니다.' })
        return
      }
    }

    // 0. [FIX] 생각그래프 모드일 경우 픽셀리어 모드로 복귀 (슈퍼 링크 원칙)
    if (useGalaxyStore.getState().viewMode === 'thoughtGraph') {
      useGalaxyStore.getState().setViewMode('pixelyer')
    }

    // 1. 전역 상태(Zustand) 업데이트
    useGalaxyStore.getState().setGalaxyKey(galaxyKey as GalaxyKey)
    useGalaxyStore.getState().setActiveCategory(categoryKey)

    // 2. 엔진 캔버스 워프 이벤트 디스패치 (로그인 유저가 있는 경우 기본적으로 내 아바타 픽셀 타겟팅)
    dispatchGalaxyWarp({
      galaxyKey: galaxyKey as GalaxyKey,
      targetPixelId: warpOptions?.targetPixelId ?? user?.id ?? undefined,
      ...warpOptions,
    })

    // 3. 브라우저 URL 동기화 (Shallow Routing - 화면 새로고침 없음)
    const currentPathname = window.location.pathname
    const LOCALE_CODES = ['en', 'ja', 'zh', 'es', 'fr', 'de', 'pt', 'it']
    const segments = currentPathname.split('/')
    const maybeLocale = segments[1] || ''
    const prefix = LOCALE_CODES.includes(maybeLocale) ? `/${maybeLocale}` : ''

    const targetUrl = galaxy.isRoot
      ? (categoryKey ? `${prefix}/${categoryKey.toLowerCase()}` : (prefix || '/'))
      : `${prefix}/${galaxy.partnerCode}${categoryKey ? `/${categoryKey.toLowerCase()}` : ''}`

    if (currentPathname !== targetUrl) {
      window.history.pushState(null, '', targetUrl)
    }
  }, [getGalaxyByKey])

  return { navigateToGalaxy }
}
