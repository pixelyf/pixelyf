'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useMoodHistory } from '@/shared/hooks/useMoodHistory'
import { MoodInsightCard, MoodInsightSkeleton } from './MoodInsightCard'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { useTranslations } from 'next-intl'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Range = 'day' | 'week' | 'month' | 'year'

export function MoodHistoryDrawer({ isOpen, onClose }: Props) {
  const tH = useTranslations('MoodHistory')
  const [range, setRange] = useState<Range>('year')
  const user = useUserStore(s => s.user)
  const { themeStyle } = useMoodColor(user?.current_mood_id)
  const { data, isLoading } = useMoodHistory(range)

  if (!isOpen) return null

  return (
    <div style={themeStyle} className="contents">
      <FullScreenModal
        style={themeStyle}
        isOpen={isOpen}
        onClose={onClose}
        title={tH('title')}
        bgColor="theme-panel-bg"
      >
        <div className="flex flex-col gap-6 pb-6 pt-5 min-h-[60vh] sm:min-h-[500px]">
          {/* Tabs */}
          <div className="flex p-1 bg-black/40 rounded-full border border-white/5 sticky top-0 z-10 backdrop-blur-md">
            {(['day', 'week', 'month', 'year'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`flex-1 py-2 text-[14px] font-bold rounded-full transition-all ${
                  range === r 
                    ? 'bg-[rgba(var(--theme-rgb),0.25)] text-white shadow-sm border border-[rgba(var(--theme-rgb),0.4)]' 
                    : 'text-slate-200 hover:text-white hover:bg-white/5'
                }`}
              >
                {tH(r)}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col gap-6">
            {isLoading ? (
              <MoodInsightSkeleton />
            ) : data ? (
              <MoodInsightCard stats={data.stats} range={range} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm font-bold text-slate-300 py-20 min-h-[500px]">
                {tH('fetchError')}
              </div>
            )}
          </div>
        </div>
      </FullScreenModal>
    </div>
  )
}
