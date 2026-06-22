'use client'

import { useState, useEffect } from 'react'
import { Loader2, Star, Zap, Award } from 'lucide-react'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useToastStore } from '@/stores/toastStore'
import { SUPERNOVA_TIERS, SupernovaTier } from '@/shared/constants/supernova'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { useTranslations } from 'next-intl'

export function SupernovaModal({
  isOpen,
  onClose,
  receiverId,
  receiverName
}: {
  isOpen: boolean;
  onClose: () => void;
  receiverId: string;
  receiverName: string;
}) {
  const currentUser = useUserStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)

  const [selectedTier, setSelectedTier] = useState<SupernovaTier>(SUPERNOVA_TIERS[0])
  const isSubmitting = false
  const { themeStyle } = useMoodColor(currentUser?.current_mood_id)
  const t = useTranslations('Supernova')

  useEffect(() => {
    return () => {
      // 모달이 닫히거나 언마운트될 때 '기능 안내' 토스트 일괄 제거
      const currentToasts = useToastStore.getState().toasts
      currentToasts.forEach((t) => {
        if (t.title === '기능 안내') {
          useToastStore.getState().removeToast(t.id)
        }
      })
    }
  }, [])

  if (!isOpen || !currentUser) return null

  const handleSupport = async () => {
    addToast({
      title: '기능 안내',
      message: '현재 버전에서는 지원되지 않습니다.',
      type: 'info',
      duration: 10000
    })
  }

  const icons = [Star, Zap, Award]

  // ── 하단 고정 액션 버튼 ──
  const actionFooter = (
    <div className="space-y-3">
      <div className="flex justify-between items-center px-1 mb-2">
        <span className="text-xs text-white font-medium">{t('ownedStardust')}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-black text-white">{(currentUser.stardust_balance || 0).toLocaleString()}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
        </div>
      </div>

      <ModalButton
        onClick={handleSupport}
        disabled={isSubmitting || (currentUser.stardust_balance || 0) < selectedTier.cost}
        isLoading={isSubmitting}
        fullWidth
      >
        {(currentUser.stardust_balance || 0) < selectedTier.cost ? t('insufficientDust') : t('activateBtn')}
      </ModalButton>
    </div>
  )

  return (
    <div style={themeStyle} className="contents">
      <FullScreenModal style={themeStyle} isOpen={isOpen} onClose={onClose} title={t('title')} footer={actionFooter} bgColor="theme-panel-bg">
        <div className="space-y-6">
          {/* Target Info */}
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-xs text-white/50 mb-1">{t('targetLabel')}</p>
            <p className="text-sm font-bold text-white">{t('targetStar', { name: receiverName })}</p>
          </div>

          {/* Tier Selection */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-white uppercase tracking-widest ml-1">{t('intensitySelect')}</p>
            <div className="grid grid-cols-1 gap-3">
              {SUPERNOVA_TIERS.map((tier, idx) => {
                const Icon = icons[idx]
                const isSelected = selectedTier.id === tier.id
                return (
                  <button
                    key={tier.id}
                    onClick={() => setSelectedTier(tier)}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isSelected ? 'theme-btn-glass !border-white shadow-lg shadow-white/10' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center`} style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#ffffff' }}>
                        <Icon size={20} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-white">{tier.label}</p>
                        <p className="text-[10px] text-white/50">{tier.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-sm font-black text-white">{tier.cost.toLocaleString()}</span>
                        <span className="text-[10px] font-bold text-indigo-400">STARDUST</span>
                      </div>
                      <p className="text-[9px] text-white/50 mt-0.5">{t('durationHours', { hours: tier.durationHours })}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </FullScreenModal>
    </div>
  )
}
