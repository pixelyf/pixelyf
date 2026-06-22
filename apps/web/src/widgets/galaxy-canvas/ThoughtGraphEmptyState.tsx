'use client'

import { useGalaxyStore } from '@/stores/galaxyStore'
import { useTranslations } from 'next-intl'

export function ThoughtGraphEmptyState() {
  const t = useTranslations('ThoughtGraph')
  const setViewMode = useGalaxyStore(s => s.setViewMode)

  // 다국어 누락 대비 방어적 폴백 구현
  const getTranslation = (key: string, fallback: string) => {
    try {
      const val = t(key)
      return val && !val.includes('ThoughtGraph.') ? val : fallback
    } catch {
      return fallback
    }
  }

  const title = getTranslation('emptyStateTitle', '아직 은하에 새겨진 생각이 없습니다')
  const desc = getTranslation('emptyStateDesc', '첫 번째 생각을 기록하여 나만의 은하를 넓혀보세요.')
  const action = getTranslation('emptyStateAction', '확인')

  return (
    <div className="absolute inset-0 flex items-center justify-center z-[15] pointer-events-none p-4">
      <div className="pointer-events-auto bg-[#0b0f10]/85 backdrop-blur-lg border border-white/10 rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.05)] text-center transition-all duration-300">
        <h3 className="text-white font-bold text-lg mb-2 tracking-tight">
          {title}
        </h3>
        <p className="text-white/60 text-sm leading-relaxed mb-6">
          {desc}
        </p>

        <button
          onClick={() => setViewMode('pixelyer')}
          className="w-full flex items-center justify-center bg-white hover:bg-white/90 active:bg-white/80 text-black font-semibold py-3 px-4 rounded-xl shadow-md transition-colors"
        >
          <span>{action}</span>
        </button>
      </div>
    </div>
  )
}
