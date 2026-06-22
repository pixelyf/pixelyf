'use client'

import { MOODS } from '@/shared/constants/moods'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { RotateCcw } from 'lucide-react'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import { useTranslations } from 'next-intl'

interface EmotionNebulaModalProps {
  isOpen: boolean
  onClose: () => void
  anchorRect?: DOMRect | null
}

export function EmotionNebulaModal({ isOpen, onClose }: EmotionNebulaModalProps) {
  const t = useTranslations('Galaxy')
  const tMood = useTranslations('Moods')
  const setSelectedFilterMoodId = useGalaxyStore(s => s.setSelectedFilterMoodId)
  const selectedFilterMoodId = useGalaxyStore(s => s.selectedFilterMoodId)

  const handleSelect = (id: string | null) => {
    setSelectedFilterMoodId(id)
    onClose()
  }

  if (!isOpen) return null

  // ── 하단 고정 초기화 버튼 ──
  const resetFooter = (
    <ModalButton
      variant="glass"
      onClick={() => handleSelect(null)}
      fullWidth
      leftIcon={<RotateCcw size={14} />}
      className="!text-white/50 hover:!text-white"
    >
      {t('resetFilter')}
    </ModalButton>
  )

  return (
    <FullScreenModal isOpen={isOpen} onClose={onClose} title={t('moodExploreLabel')} footer={resetFooter} bgColor="bg-[#0b0f10]">
      <p className="text-xs text-white/40 mt-4 mb-6">{t('moodExploreDesc')}</p>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-3">
        {MOODS.map((mood) => {
          const isActive = selectedFilterMoodId === mood.id
          return (
            <button
              key={mood.id}
              onClick={() => handleSelect(mood.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-white/10 border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/15'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${mood.colorClass} flex items-center justify-center shadow-md ${
                isActive ? 'ring-2 ring-white/40' : ''
              }`}>
                <mood.icon size={18} className="text-white drop-shadow-md" />
              </div>
              <span className={`text-[10px] font-bold tracking-tight ${
                isActive ? 'text-white' : 'text-white/50'
              }`}>
                {tMood(mood.id)}
              </span>
            </button>
          )
        })}
      </div>
    </FullScreenModal>
  )
}
