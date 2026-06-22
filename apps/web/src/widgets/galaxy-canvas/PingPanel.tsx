'use client'

/**
 * PingPanel — 핑 선택/확인 UI 서브컴포넌트
 *
 * [아키텍처] PixelDetailDrawer에서 추출된 순수 UI 컴포넌트.
 * - 일반 핑 12종 선택 그리드
 * - 크리스탈 핑 (슈퍼핑) 4단계
 * - 이미 보낸 핑 확인 + 취소 UI
 */

import React from 'react'
import { motion } from 'framer-motion'
import {
  HandHelping,
  Droplets,
  Umbrella,
  Moon,
  Heart,
  Zap,
  HandMetal,
  Sparkles,
  Star,
  Wand2,
  Share2,
  Telescope,
} from 'lucide-react'

import { PING_TYPES, PING_ICON_MAP, PING_GLOW_COLORS, PING_WHITE_BG_COLORS } from '@/shared/constants/pings'
import { CRYSTAL_PING_TIERS } from '@/shared/constants/crystalPings'
import { usePingStore } from '@/stores/pingStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useTranslations } from 'next-intl'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'

interface PingPanelProps {
  momentId: string
  sentPingId: string | null
  /** 모먼트별 핑 상태 맵 (momentId → pingId) */
  momentPings: Record<string, string | null>
  isSending: boolean
  selectedPixelId: string | null
  onPingSelect: (pingId: string, momentId: string) => void
  onPingCancel: (momentId: string) => void
  onCrystalPingSent: (pingId: string) => void
  setIsSending: (v: boolean) => void
  setSentPingId: (v: string | null) => void
}

export const PingPanel = React.memo(function PingPanel({
  momentId,
  momentPings,
  isSending,
  selectedPixelId,
  onPingSelect,
  onPingCancel,
  setIsSending,
  setSentPingId,
}: PingPanelProps) {
  const t = useTranslations('Pixel')
  const pingCooldown = usePingStore(s => s.pingCooldown)
  const momentIsPinging = usePingStore(s => s.momentIsPinging)
  const isThisMomentPinging = !!(momentIsPinging[momentId] || (momentId && momentIsPinging[momentId]))
  const userProfile = useUserStore(s => s.user)
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)

  const sentPingId = momentPings[momentId]

  // ── 이미 핑을 보낸 경우: 확인 + 취소 UI ──
  if (sentPingId) {
    const ping = PING_TYPES.find(p => p.id === sentPingId)
    const IconComponent = ping ? PING_ICON_MAP[ping.icon] : null
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full bg-slate-100 border border-slate-200/80 rounded-2xl p-5 mt-3 flex flex-col items-center justify-center gap-4 shadow-inner overflow-hidden"
      >
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">{t('myPingSent')}</p>
        {ping && (
          <div className="flex flex-col items-center text-center">
            {/* 1. 핑 할때와 동일한 규격의 아름다운 정원형 아이콘 */}
            <div 
              className="h-14 w-14 aspect-square rounded-full border border-slate-200/80 bg-white shadow-sm flex items-center justify-center shrink-0"
              style={{
                boxShadow: `0 8px 32px 0 ${PING_GLOW_COLORS[ping.id] || '#ffffff'}25`
              }}
            >
              {IconComponent && <IconComponent size={24} className={PING_WHITE_BG_COLORS[ping.id] || ping.iconColorClass} />}
            </div>
            {/* 2. 원 아래에 이쁘게 배치되는 타이틀 */}
            <span className="text-[12px] font-black text-slate-800 mt-2 leading-none block">{ping.label}</span>
            {/* 3. 설명은 그 아래에 조화롭게 배치 */}
            <span className="text-xs text-slate-500 mt-2.5 block font-medium max-w-[250px] leading-relaxed">{ping.emotionalMessage}</span>
          </div>
        )}
        <button
          onClick={() => onPingCancel(momentId)}
          className="mt-2 px-5 py-2.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-950 text-sm font-bold transition-all active:scale-95 shadow-sm"
        >
          {t('cancelPing')}
        </button>
      </motion.div>
    )
  }

  // ── 핑 선택 UI ──
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full bg-slate-100 border border-slate-200/80 rounded-2xl p-4 mt-3 shadow-inner overflow-hidden relative"
    >
      {/* 핑 발송 중일 때 띄워지는 로딩 오버레이 및 LogoSpinner */}
      {isThisMomentPinging && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-2">
          <LogoSpinner size={24} variant="brand" />
          <span className="text-[11px] font-black text-slate-800 tracking-wider">보내는 중...</span>
        </div>
      )}
      <p className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-3 text-center">{t('selectPingType')}</p>
      <div className="grid grid-cols-6 gap-y-3 gap-x-2 justify-items-center">
        {PING_TYPES.map(ping => {
          const IconComponent = PING_ICON_MAP[ping.icon]
          return (
            <div key={ping.id} className="flex flex-col items-center shrink-0">
              <button
                onClick={() => onPingSelect(ping.id, momentId)}
                disabled={isSending || pingCooldown}
                title={ping.emotionalMessage || ping.label}
                className="h-14 w-14 aspect-square !rounded-full border border-slate-200/80 bg-white hover:bg-slate-50 duration-200 hover:scale-105 active:scale-95 shadow-sm flex items-center justify-center shrink-0"
              >
                {IconComponent && <IconComponent size={24} className={PING_WHITE_BG_COLORS[ping.id] || ping.iconColorClass} />}
              </button>
              <span className="text-[9.5px] font-black text-slate-700 mt-1.5 leading-none">{ping.label}</span>
            </div>
          )
        })}
      </div>

      {/* 크리스탈 핑 (슈퍼핑) - 정책 제거 검토중으로 주석 처리
      <div className="mt-3 pt-3 border-t border-slate-200/80">
        <p className="text-sm font-bold text-amber-700 uppercase tracking-widest mb-2 text-center">{t('crystalPing')}</p>
        <div className="grid grid-cols-4 gap-2">
          {CRYSTAL_PING_TIERS.map(tier => {
            const balance = userProfile?.stardust_balance ?? 0
            const canAfford = balance >= tier.cost
            return (
              <button
                key={tier.id}
                onClick={async () => {
                  if (!canAfford || isSending || pingCooldown) return
                  setIsSending(true)
                  usePingStore.getState().setActivePingMomentId(null)
                  setSentPingId('blessing')

                  window.dispatchEvent(new CustomEvent('optimistic-feed-update', {
                    detail: { pixelId: selectedPixelId, momentId, field: 'pings', delta: 1, pingId: 'blessing' }
                  }))

                  try {
                    const res = await fetch('/api/pings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        receiverId: selectedPixelId,
                        pingType: 'blessing',
                        isCrystal: true,
                        crystalTierId: tier.id,
                        momentId: momentId,
                        galaxyKey,
                      })
                    })
                    if (res.ok) {
                      const data = await res.json()
                      if (data.newBalance !== undefined) {
                        useUserStore.getState().setUser({
                          ...userProfile!,
                          stardust_balance: data.newBalance
                        })
                      }
                    } else {
                      setSentPingId(null)
                    }
                  } catch {
                    setSentPingId(null)
                  } finally {
                    setIsSending(false)
                    usePingStore.getState().setPingCooldown(true)
                    setTimeout(() => {
                      usePingStore.getState().setPingCooldown(false)
                    }, 3000)
                  }
                }}
                disabled={!canAfford || isSending || pingCooldown}
                className={`flex flex-col justify-center items-center aspect-square !rounded-full border border-slate-200/80 bg-white hover:bg-amber-50/50 duration-200 hover:scale-105 active:scale-95 shadow-sm ${!canAfford ? 'opacity-30' : ''}`}
              >
                <span className="text-sm font-black text-amber-700">{tier.label}</span>
                <span className="text-[13px] text-slate-500 font-bold">{tier.cost.toLocaleString()} SD</span>
              </button>
            )
          })}
        </div>
        <p className="text-[13px] text-slate-400 text-center mt-1.5 font-medium">{t('crystalPingDesc')}</p>
      </div>
      */}
    </motion.div>
  )
})
