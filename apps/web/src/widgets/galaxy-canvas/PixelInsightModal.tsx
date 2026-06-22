'use client'

import React, { useEffect, useRef } from 'react'
import { X, BarChart2, Eye, Calendar, TrendingUp, Hand, Link2, BellRing, MessageSquare, Sparkles, Heart, Activity } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { PING_TYPES } from '@/shared/constants/pings'
import { GalaxyModal } from './GalaxyModal'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { requestHideTabBar, requestShowTabBar } from '@/shared/lib/bridge'
import { isNativeApp } from '@/shared/utils/isNativeApp'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { useTranslations } from 'next-intl'

export function PixelInsightModal({
  isOpen,
  onClose,
  stats,
  pixelName,
  moodId
}: {
  isOpen: boolean;
  onClose: () => void;
  stats: any;
  pixelName: string;
  moodId?: string | null;
}) {
  const hasRegistered = useRef(false)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const { themeStyle } = useMoodColor(moodId)
  const t = useTranslations('Pixel')

  // ── 네이티브 탭바 숨김/표시 브릿지 ──
  useEffect(() => {
    if (!isNativeApp()) return

    if (isOpen && !hasRegistered.current) {
      hasRegistered.current = true
      requestHideTabBar()
    } else if (!isOpen && hasRegistered.current) {
      hasRegistered.current = false
      requestShowTabBar()
    }

    return () => {
      if (hasRegistered.current) {
        hasRegistered.current = false
        requestShowTabBar()
      }
    }
  }, [isOpen])

  if (!isOpen || !stats) return null

  const totalInteractions =
    (stats.touches || 0) +
    (stats.bonds || 0) +
    (stats.subscriptions || 0) +
    (stats.comments || 0) +
    (stats.supernovas || 0) +
    (stats.pings?.reduce((acc: number, cur: any) => acc + cur.count, 0) || 0)

  const totalPings = stats.pings?.reduce((acc: number, cur: any) => acc + cur.count, 0) || 0

  // ── 공통 본문 (대시보드 내용) ──
  const dashboardContent = (
    <>
      <div 
        style={{ 
          backgroundColor: 'var(--theme-card-bg, rgba(255, 255, 255, 0.05))', 
          borderColor: 'rgba(var(--theme-rgb), 0.15)' 
        }} 
        className="p-4 mb-6 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div>
          <p className="text-xs text-slate-400 mb-1">{t('insightTarget')}</p>
          <p className="text-lg md:text-xl font-black text-white">{t('insightEcosystem', { name: pixelName })}</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-xs text-slate-400 mb-1">{t('insightTotalIndex')}</p>
          <p className="text-2xl font-black text-white">{totalInteractions.toLocaleString()} <span className="text-sm text-white/30 font-medium">{t('insightUnit')}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">


        {/* Left Column: Visits */}
        <div className="md:col-span-1 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <Eye size={16} className="text-slate-300" /> {t('insightVisitorTraffic')}
            </h3>
            <div 
              style={{ 
                backgroundColor: 'var(--theme-card-bg, rgba(255, 255, 255, 0.05))', 
                borderColor: 'rgba(var(--theme-rgb), 0.15)' 
              }} 
              className="p-5 rounded-2xl border mb-3 flex flex-col items-center justify-center text-center"
            >
              <p className="text-xs text-slate-400 font-medium mb-1">{t('insightTotalVisitors')}</p>
              <p className="text-4xl font-black text-white">{(stats.visits?.total_visits || 0).toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div 
                style={{ 
                  backgroundColor: 'var(--theme-card-bg, rgba(255, 255, 255, 0.05))', 
                  borderColor: 'rgba(var(--theme-rgb), 0.15)' 
                }} 
                className="p-4 rounded-2xl border text-center"
              >
                <p className="text-xs text-white/50 font-medium mb-1">{t('insightToday')}</p>
                <p className="text-xl font-black text-white">{(stats.visits?.today_visits || 0).toLocaleString()}</p>
              </div>
              <div 
                style={{ 
                  backgroundColor: 'var(--theme-card-bg, rgba(255, 255, 255, 0.05))', 
                  borderColor: 'rgba(var(--theme-rgb), 0.15)' 
                }} 
                className="p-4 rounded-2xl border text-center"
              >
                <p className="text-xs text-white/50 font-medium mb-1">{t('insightYesterday')}</p>
                <p className="text-xl font-black text-slate-400">{(stats.visits?.yesterday_visits || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactions & Pings */}
        <div className="md:col-span-2 space-y-6">

          {/* Interaction Summary */}
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-slate-300" />{t('insightInteractionSummary')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {[
                { label: t('insightTouchLabel'), value: stats.touches, icon: Hand },
                { label: t('insightBondLabel'), value: stats.bonds, icon: Link2 },
                { label: t('insightSubLabel'), value: stats.subscriptions, icon: BellRing },
                { label: t('insightSupernovaLabel'), value: stats.supernovas, icon: Sparkles },
                { label: t('insightCommentLabel'), value: stats.comments, icon: MessageSquare },
                { label: t('insightReceivedPing') || '받은 핑', value: totalPings, icon: Activity },
              ].map((item, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    backgroundColor: 'var(--theme-card-bg, rgba(255, 255, 255, 0.05))', 
                    borderColor: 'rgba(var(--theme-rgb), 0.15)' 
                  }} 
                  className="p-4 rounded-2xl border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors cursor-default"
                >
                  <div 
                    style={{ backgroundColor: 'rgba(var(--theme-rgb), 0.1)' }} 
                    className="p-2 rounded-xl mb-2 text-white"
                  >
                    <item.icon size={18} />
                  </div>
                  <p className="text-[10px] font-bold text-white/50 mb-1">{item.label}</p>
                  <p className="text-lg font-black text-white">{(item.value || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ping Distribution */}
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <Activity size={16} className="text-slate-300" /> {t('insightReceivedPing')} ({totalPings.toLocaleString()})
            </h3>
            <div 
              style={{ 
                backgroundColor: 'var(--theme-card-bg, rgba(255, 255, 255, 0.05))', 
                borderColor: 'rgba(var(--theme-rgb), 0.15)' 
              }} 
              className="p-6 rounded-2xl border"
            >
              {(!stats.pings || stats.pings.length === 0) ? (
                <div className="text-center py-8">
                  <Heart size={32} className="text-white/10 mx-auto mb-3" />
                  <p className="text-sm font-bold text-white/40">{t('insightNoPing')}</p>
                  <p className="text-xs text-white/20 mt-1">{t('insightNoPingDesc')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {stats.pings.map((p: any, idx: number) => {
                    const pingInfo = PING_TYPES.find(pt => pt.id === p.ping_type)
                    const maxCount = stats.pings[0]?.count || 1
                    const percentage = Math.round((p.count / maxCount) * 100)
                    const IconComp = (LucideIcons as any)[pingInfo?.icon || 'Heart'] || Heart

                    return (
                      <div key={p.ping_type} className="flex items-center gap-4 group">
                        <div 
                          style={{ 
                            backgroundColor: 'rgba(var(--theme-rgb), 0.1)', 
                            borderColor: 'rgba(var(--theme-rgb), 0.15)' 
                          }} 
                          className="w-10 h-10 shrink-0 rounded-2xl border flex items-center justify-center group-hover:scale-110 transition-transform"
                        >
                          <IconComp size={18} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="font-bold text-white">{pingInfo?.label || p.ping_type}</span>
                            <span className="font-bold text-white/70">{p.count.toLocaleString()} <span className="text-[10px] text-white/30 font-medium ml-0.5">{t('insightPingCount')}</span></span>
                          </div>
                          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-1000 ease-out"
                              style={{ 
                                width: `${percentage}%`,
                                backgroundColor: 'var(--theme-color, rgb(var(--theme-rgb)))'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div 
        style={{ 
          backgroundColor: 'rgba(var(--theme-rgb), 0.03)', 
          borderColor: 'rgba(var(--theme-rgb), 0.15)' 
        }} 
        className="mt-6 p-5 border text-center shrink-0 backdrop-blur-md rounded-2xl"
      >
        <p className="text-[10px] font-medium text-white/40 tracking-wide leading-relaxed">
          {t('insightDisclaimer')}
        </p>
      </div>
    </>
  )

  // ── 모바일 환경: FullScreenModal 분기 ──
  if (isMobile) {
    return (
      <div style={themeStyle} className="contents">
        <FullScreenModal
          style={themeStyle}
          isOpen={isOpen}
          onClose={onClose}
          title={t('insightTitle', { name: pixelName })}
          bgColor="theme-panel-bg"
        >
          <div className="pt-2">
            {dashboardContent}
          </div>
        </FullScreenModal>
      </div>
    )
  }

  // ── 데스크탑 환경: 와이드(4xl) 대시보드 ──
  return (
    <div style={themeStyle} className="contents">
      <GalaxyModal
        style={themeStyle}
        isOpen={isOpen}
        onClose={onClose}
        size="4xl"
        zIndex={150}
        className="flex flex-col max-h-[90vh] theme-panel-bg"
      >
        {/* 화려한 데스크탑 헤더 */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-transparent shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
              <Activity className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white leading-tight">{t('insightTitle', { name: pixelName })}</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Analytics Dashboard</p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-slate-400 hover:text-white transition p-3 rounded-xl hover:bg-white/5"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {dashboardContent}
        </div>
      </GalaxyModal>
    </div>
  )
}
