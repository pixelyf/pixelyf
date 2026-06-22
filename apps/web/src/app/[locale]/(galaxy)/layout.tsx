'use client'

import { ReactNode } from 'react'
import { GalaxyLayoutSwitch } from '@/widgets/galaxy-canvas/GalaxyLayoutSwitch'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useGalaxyStore } from '@/stores/galaxyStore'

type Props = {
  children: ReactNode
}

export default function GalaxyLayout({ children }: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const mobileViewMode = useGalaxyStore(s => s.mobileViewMode)
  const isFeedMode = isMobile && mobileViewMode === 'feed'

  return (
    <main 
      className={`relative w-full bg-slate-950 ${
        isFeedMode ? 'min-h-screen h-auto overflow-visible' : 'h-screen overflow-hidden'
      }`}
    >
      <GalaxyLayoutSwitch />
      {children}
    </main>
  )
}
