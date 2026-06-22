'use client'

import React from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { GalaxyLoadingShell } from './GalaxyLoadingShell'

interface GalaxyLoaderProps {
  progress: number
  status: string
  isFadeOut?: boolean
}

export const GalaxyLoader: React.FC<GalaxyLoaderProps> = ({
  progress,
  status,
  isFadeOut,
}) => {
  const isSearchFeedOpen = useGalaxyStore((state) => state.isSearchFeedOpen)
  const selectedPixelId = useGalaxyStore((state) => state.selectedPixelId)
  const pixelPanelWidth = useGalaxyStore((state) => state.pixelPanelWidth)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isPanelOpen = !isMobile && (isSearchFeedOpen || !!selectedPixelId)

  return (
    <div className={`absolute inset-0 z-[100] flex flex-row bg-[#050510] overflow-hidden transition-all duration-500 ease-in-out ${isFadeOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'}`}>
      <div className="relative flex-1 min-w-0">
        <GalaxyLoadingShell progress={progress} status={status} />
      </div>
      {isPanelOpen && <div style={{ width: pixelPanelWidth }} className="shrink-0 bg-[#050510]" />}
    </div>
  )
}
