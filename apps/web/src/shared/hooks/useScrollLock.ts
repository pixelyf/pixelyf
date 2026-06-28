'use client'

import { useEffect } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'

export function useScrollLock() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const mobileViewMode = useGalaxyStore(s => s.mobileViewMode)
  
  const selectedPixelId = useGalaxyStore(s => s.selectedPixelId)
  const selectedThoughtId = useGalaxyStore(s => s.selectedThoughtId)
  const activeDmRoomId = useGalaxyStore(s => s.activeDmRoomId)
  const isSettingsOpen = useGalaxyStore(s => s.isSettingsOpen)
  const isInsightOpen = useGalaxyStore(s => s.isInsightOpen)
  const isMomentModalOpen = useGalaxyStore(s => s.isMomentModalOpen)

  const isPixelPopupOpen = Boolean(selectedPixelId)

  const isAnyPopupOpen = Boolean(
    isPixelPopupOpen ||
    selectedThoughtId ||
    activeDmRoomId ||
    isSettingsOpen ||
    isInsightOpen ||
    isMomentModalOpen
  )

  const shouldLock = isAnyPopupOpen || mobileViewMode === 'canvas'

  useEffect(() => {
    if (!isMobile) return

    if (shouldLock) {
      document.body.style.overflow = 'hidden'
      document.body.style.height = '100%'

      document.documentElement.style.overflow = 'hidden'
      document.documentElement.style.height = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.height = ''

      document.documentElement.style.overflow = ''
      document.documentElement.style.height = ''
    }

    return () => {
      document.body.style.overflow = ''
      document.body.style.height = ''

      document.documentElement.style.overflow = ''
      document.documentElement.style.height = ''
    }
  }, [isMobile, shouldLock])
}
