'use client'

/**
 * [생각그래프] 화면 A — 뷰 전환 토글 (78번 §2)
 * 
 * 글라스모피즘 셸 및 이모지가 제거된 플랫 텍스트 탭 형태
 * [픽셀리어 / 생각그래프]
 */

import React from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useTranslations } from 'next-intl'
import { Layers, Brain } from 'lucide-react'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'

export function ThoughtGraphToggle() {
  const t = useTranslations('Galaxy')
  const viewMode = useGalaxyStore(s => s.viewMode)
  const setViewMode = useGalaxyStore(s => s.setViewMode)

  const tabs = [
    { key: 'pixelyer' as const, label: t('viewPixelyer'), id: 'btn-view-pixelyer' },
    { key: 'thoughtGraph' as const, label: t('viewThoughtGraph'), id: 'btn-view-thoughtgraph' },
  ]

  const isMobile = useMediaQuery('(max-width: 767px)')

  return (
    <>
      {isMobile ? (
        /* 모바일 뷰: 기존 원형 아이콘 구조 유지 */
        <div className="pointer-events-auto flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-[0_4px_12px_rgba(0,0,0,0.5)] select-none gap-0.5">
          {tabs.map((tab) => {
            const isActive = viewMode === tab.key
            const Icon = tab.key === 'pixelyer' ? Layers : Brain
            return (
              <button
                key={tab.key}
                id={tab.id}
                onClick={() => setViewMode(tab.key)}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95
                  ${isActive
                    ? 'bg-white text-black shadow-md font-black'
                    : 'text-white/40 hover:text-white/70'
                  }
                `}
                title={tab.label}
              >
                <Icon size={16} />
              </button>
            )
          })}
        </div>
      ) : (
        /* 데스크탑 뷰: 이전 플랫 텍스트 구조 복원 */
        <div data-tour="view-switcher" className="pointer-events-auto flex items-center gap-1 select-none">
          {tabs.map((tab, idx) => {
            const isActive = viewMode === tab.key
            return (
              <React.Fragment key={tab.key}>
                {idx > 0 && <span className="text-white/30 text-[14px] font-medium mx-0.5">/</span>}
                <button
                  id={tab.id}
                  onClick={() => setViewMode(tab.key)}
                  className={`
                    px-1.5 py-1 text-[14px] font-bold tracking-tight transition-colors duration-300
                    drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]
                    ${isActive
                      ? 'text-white font-extrabold active:scale-95'
                      : 'text-white/60 hover:text-white/90 active:scale-95'
                    }
                  `}
                >
                  {tab.label}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      )}
    </>
  )
}
