'use client'

import { useEffect } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { dispatchGalaxyWarp } from '@/shared/utils/galaxyWarp'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { stripLocalePrefix } from '@/shared/lib/i18n/stripLocalePrefix'

/**
 * 브라우저 뒤로 가기/앞으로 가기 (popstate) 이벤트를 감지하여
 * URL과 Zustand 전역 상태(은하, 카테고리, 픽셀 선택)를 동기화하는 훅입니다.
 */
export function usePopStateSync() {
  const { galaxies } = useGalaxySystem()

  useEffect(() => {
    const handlePopState = () => {
      const pathname = stripLocalePrefix(window.location.pathname)
      const searchParams = new URLSearchParams(window.location.search)
      const store = useGalaxyStore.getState()

      // 1. URL Pathname에서 은하 및 카테고리 추출
      const segments = pathname.split('/').filter(Boolean)
      let targetGalaxyKey = 'PIXELYF'
      let targetCategoryKey: string | null = null

      if (segments.length === 0) {
        // 루트 경로 (/)
        targetGalaxyKey = 'PIXELYF'
      } else {
        const slug = segments[0]
        const cat = segments[1]
        
        // slug가 partnerCode인 은하 찾기
        const galaxyByPartnerCode = galaxies.find(g => g.partnerCode === slug)
        if (galaxyByPartnerCode) {
          targetGalaxyKey = galaxyByPartnerCode.key
          if (cat) {
            const matchedCat = galaxyByPartnerCode.categories.find(c => c.key.toLowerCase() === cat.toLowerCase())
            if (matchedCat) targetCategoryKey = matchedCat.key
          }
        } else {
          // 루트 은하의 카테고리인지 확인
          const rootGalaxy = galaxies.find(g => g.isRoot)
          if (rootGalaxy) {
            const matchedCat = rootGalaxy.categories.find(c => c.key.toLowerCase() === slug.toLowerCase())
            if (matchedCat) {
              targetGalaxyKey = rootGalaxy.key
              targetCategoryKey = matchedCat.key
            }
          }
        }
      }

      // 2. Zustand 상태 동기화 및 캔버스 워프 트리거
      if (store.galaxyKey !== targetGalaxyKey) {
        store.setGalaxyKey(targetGalaxyKey as any)
        const userId = useUserStore.getState().user?.id
        dispatchGalaxyWarp({
          galaxyKey: targetGalaxyKey as any,
          targetPixelId: userId ?? undefined,
        })
      }
      if (store.activeCategory !== targetCategoryKey) {
        store.setActiveCategory(targetCategoryKey)
      }

      // 3. URL Query Params에서 픽셀 선택 상태 추출
      const pixelId = searchParams.get('pixel')
      
      if (pixelId && store.selectedPixelId !== pixelId) {
        store.selectPixel(pixelId)
      } else if (!pixelId && store.selectedPixelId) {
        store.selectPixel(null)
      }

      // 4. URL Query Params에서 DM 상태 추출
      const dmRoomId = searchParams.get('dm')
      if (dmRoomId && store.activeDmRoomId !== dmRoomId) {
        store.setActiveDmRoomId(dmRoomId)
      } else if (!dmRoomId && store.activeDmRoomId) {
        store.setActiveDmRoomId(null)
      }

      // 5. URL Pathname에서 설정 모달 상태 추출
      const isSettings = pathname === '/settings'
      if (isSettings && !store.isSettingsOpen) {
        store.setIsSettingsOpen(true)
      } else if (!isSettings && store.isSettingsOpen) {
        store.setIsSettingsOpen(false)
      }
    }

    // [FIX] 마운트 시 즉시 실행 제거: GalaxyRouteInitializer가 이미 서버에서 결정한
    // galaxyKey를 setGalaxyKey()로 설정하므로, 여기서 중복 실행하면
    // 키 불일치로 불필요한 워프(targetPixelId 없이 zoom 0.05)가 발생합니다.
    // usePopStateSync는 브라우저 뒤로/앞으로 가기(popstate)에만 반응합니다.

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [galaxies])
}
