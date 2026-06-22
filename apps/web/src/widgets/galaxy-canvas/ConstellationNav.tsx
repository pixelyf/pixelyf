'use client'

import './ConstellationNav.css'

import { useState, useCallback } from 'react'
import { Compass } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { CAMERA_ZOOM } from '@/shared/constants/camera'
import { ALL_CONSTELLATIONS } from './constellations/constellationData'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { useTranslations } from 'next-intl'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'

/**
 * [별자리 내비게이션 — 텍스트 버튼 + 공통 풀스크린 모달]
 */
export function ConstellationNav() {
  const t = useTranslations('Galaxy')
  const tConstell = useTranslations('Constellations')
  const [isOpen, setIsOpen] = useState(false)
  const enabledConstellations = ALL_CONSTELLATIONS.filter(c => c.enabled)

  const handleNavigate = useCallback((centerX: number, centerY: number) => {
    useGalaxyStore.getState().focusOnPosition(centerX, centerY, CAMERA_ZOOM.PIXEL_FOCUS)
    setIsOpen(false)
  }, [])

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(prev => !prev)
  }, [])

  const isMobile = useMediaQuery('(max-width: 767px)')

  return (
    <>
      {isMobile ? (
        /* 모바일 뷰: 기존 원형 글라스 아이콘 버튼 유지 */
        <button
          onClick={handleToggle}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className={`pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 shadow-[0_4px_12px_rgba(0,0,0,0.5)] ${
            isOpen
              ? 'bg-white text-black border border-white shadow-[0_0_12px_rgba(255,255,255,0.4)] font-black'
              : 'bg-black/40 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:border-white/20'
          }`}
          title={t('constellationExplore')}
        >
          <Compass size={18} />
        </button>
      ) : (
        /* 데스크탑 뷰: 이전 텍스트 트리거 구조 복원 */
        <button
          data-tour="constellation-explore"
          onClick={handleToggle}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className={`constellation-trigger-btn pointer-events-auto ${isOpen ? 'constellation-trigger-btn--active' : ''}`}
        >
          <span className="constellation-trigger-dot" />
          <span>{t('constellationExplore')}</span>
        </button>
      )}

      {/* ── 공통 풀스크린 모달 ── */}
      <FullScreenModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('constellationExplore')}
        bgColor="bg-[#0b0f10]"
        maxWidth="max-w-3xl"
      >
        <p className="text-xs text-white/40 mt-4 mb-6">{t('constellationDesc')}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {enabledConstellations.map((c) => {
            const filledSlots = c.stars.filter(s => s.assignedPixelId).length
            const totalSlots = c.stars.length

            return (
              <button
                key={c.id}
                onClick={() => handleNavigate(c.centerX, c.centerY)}
                className="flex flex-col items-start gap-3 p-4 rounded-2xl border bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/15 transition-all duration-200 active:scale-95 text-left"
              >
                <div className="flex items-center gap-3 w-full">
                  <div 
                    className="w-4 h-4 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: c.color, boxShadow: `0 0 10px ${c.color}` }}
                  />
                  <span className="text-sm font-bold text-white truncate flex-1">{tConstell(c.id)}</span>
                </div>
                <div className="w-full flex justify-between items-center mt-1">
                  <span className="text-[10px] text-white/40 font-bold">{t('occupancy')}</span>
                  <span className="text-[11px] text-white/70 font-mono font-bold tracking-tight">
                    {filledSlots} / {totalSlots}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </FullScreenModal>
    </>
  )
}
