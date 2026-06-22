'use client'

import React, { useState, useRef } from 'react'
import { EmotionNebulaModal } from './EmotionNebulaModal'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { MOODS } from '@/shared/constants/moods'
import { X, Sparkles } from 'lucide-react'

import { ConstellationNav } from './ConstellationNav'
import { ThoughtGraphToggle } from './ThoughtGraphToggle'
import { ThoughtGraphScopeFilter } from './ThoughtGraphScopeFilter'

import { isNativeApp } from '@/shared/utils/isNativeApp'
import { useTranslations } from 'next-intl'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'

interface CategoryFilterProps {
  onFilterChange?: (filterId: string) => void
}

export function CategoryFilter({ onFilterChange }: CategoryFilterProps) {
  const t = useTranslations('Galaxy')
  const tMood = useTranslations('Moods')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  const selectedFilterMoodId = useGalaxyStore(s => s.selectedFilterMoodId)
  const setSelectedFilterMoodId = useGalaxyStore(s => s.setSelectedFilterMoodId)
  const viewMode = useGalaxyStore(s => s.viewMode)
  
  const selectedMood = MOODS.find(m => m.id === selectedFilterMoodId)

  // 네이티브 앱 캔버스 모드에서는 헤더가 없으므로 버튼을 상단으로 올림
  const isNative = isNativeApp()
  const isMobile = useMediaQuery('(max-width: 767px)')

  const handleOpenModal = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsModalOpen(true)
  }

  const handleClearFilter = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedFilterMoodId(null)
  }

  return (
    <>
      <div className={`fixed ${isNative ? 'top-2' : 'top-14'} left-0 z-40 flex items-center gap-2.5 px-4 h-12 pointer-events-none`}>
        
        {/* ── A. [픽셀리어 모드] 생각별 픽셀리어 + 별자리 탐색 ── */}
        {viewMode === 'pixelyer' && (
          <>
            {isMobile ? (
              /* 모바일 뷰: 기존 원형 아이콘 구조 유지 */
              <div
                ref={buttonRef as any}
                className="pointer-events-auto shrink-0 flex items-center gap-1.5"
              >
                <button
                  onClick={handleOpenModal}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 shadow-[0_4px_12px_rgba(0,0,0,0.5)] relative
                    ${selectedFilterMoodId
                      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                      : 'bg-black/40 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:border-white/20'
                    }
                  `}
                  title={selectedMood ? t('moodFilterLabel', { mood: tMood(selectedMood.id) }) : t('moodExploreLabel')}
                >
                  {selectedMood ? (
                    <div className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${selectedMood.colorClass} shadow-[0_0_6px_white] animate-pulse`} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                </button>
                
                {selectedFilterMoodId && (
                  <button 
                    onClick={handleClearFilter}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-6 h-6 rounded-full bg-white/5 border border-white/10 hover:bg-white/20 transition-colors flex items-center justify-center active:scale-95"
                    title={t('clearFilter') || 'Clear Filter'}
                  >
                    <X size={12} className="text-white/80" />
                  </button>
                )}
              </div>
            ) : (
              /* 데스크탑 뷰: 이전 텍스트 탭 구조 복원 */
              <button
                ref={buttonRef}
                data-tour="mood-explore"
                onClick={handleOpenModal}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className={`pointer-events-auto shrink-0 flex items-center gap-1.5 px-2 py-1.5 text-[14px] font-bold tracking-tight transition-all duration-300 group active:scale-95 ${
                  selectedFilterMoodId
                    ? 'text-white font-extrabold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                    : 'text-white/60 hover:text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                }`}
              >
                {selectedMood ? (
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${selectedMood.colorClass} shadow-[0_0_8px_white]`} />
                ) : (
                  <span className="constellation-trigger-dot" />
                )}
                <span>
                  {selectedMood ? `${tMood(selectedMood.id)} 픽셀리어` : t('moodExploreLabel')}
                </span>
                {selectedFilterMoodId && (
                  <div 
                    onClick={handleClearFilter}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="p-1 -ml-1 rounded-full hover:bg-white/20 transition-colors pointer-events-auto"
                  >
                    <X size={14} className="text-white/80" />
                  </div>
                )}
              </button>
            )}
            
            {/* 별자리 탐색 */}
            <ConstellationNav />
          </>
        )}

        {/* ── B. [공통] 뷰 모드 전환 토글 (픽셀리어 / 생각그래프) ── */}
        <ThoughtGraphToggle />

        {/* ── C. [생각그래프 모드] 전체 은하 / 내 은하 필터 ── */}
        {viewMode === 'thoughtGraph' && (
          <>
            <ThoughtGraphScopeFilter />
          </>
        )}

      </div>
      <EmotionNebulaModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        anchorRect={buttonRef.current?.getBoundingClientRect()}
      />
    </>
  )
}
