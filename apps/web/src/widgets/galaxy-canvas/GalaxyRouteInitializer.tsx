'use client'

import { useEffect } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { dispatchGalaxyWarp } from '@/shared/utils/galaxyWarp'
import type { GalaxyKey } from '@/shared/constants/galaxySystem'

interface Props {
  galaxyKey: string
  activeCategory?: string
}

/**
 * Server → Client 은하 상태 초기화 브릿지.
 * URL 기반 라우팅에서 서버 컴포넌트가 결정한 galaxyKey/activeCategory를
 * Zustand galaxyStore에 동기화합니다.
 */
export function GalaxyRouteInitializer({ galaxyKey, activeCategory }: Props) {
  useEffect(() => {
    const store = useGalaxyStore.getState()
    
    // 현재 스토어 상태와 다를 때만 업데이트
    if (store.galaxyKey !== galaxyKey) {
      store.setGalaxyKey(galaxyKey as GalaxyKey)
      dispatchGalaxyWarp({ galaxyKey: galaxyKey as GalaxyKey })
    }
    
    if (activeCategory && store.activeCategory !== activeCategory) {
      store.setActiveCategory(activeCategory)
    }
  }, [galaxyKey, activeCategory])

  return null
}
