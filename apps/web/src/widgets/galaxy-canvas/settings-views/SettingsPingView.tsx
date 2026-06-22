'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Send, Inbox, Hand, Gem, Sparkles } from 'lucide-react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { PING_TYPES } from '@/shared/constants/pings'
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useTranslations } from 'next-intl'

interface PingHistoryItem {
  id: string
  pingType: string
  isCrystal: boolean
  createdAt: string
  momentId?: string | null
  momentPreview?: string | null
  partner: {
    id: string
    displayName: string
    pixelId: string | null
  }
}

interface PingStats {
  totalSent: number
  totalReceived: number
  typeDistribution: Record<string, number>
}

interface TouchStats {
  totalSent: number
  totalReceived: number
}

interface TouchHistoryItem {
  id: string
  createdAt: string
  toucher: {
    id: string
    displayName: string
    pixelId: string | null
  }
}

const PING_LIMIT = 20

export function SettingsPingView({ galaxyKey: galaxyKeyProp }: { galaxyKey?: string | null }) {
  const t = useTranslations('Settings')
  const storeGalaxyKey = useGalaxyStore(s => s.galaxyKey)
  const galaxyKey = galaxyKeyProp ?? storeGalaxyKey
  const [pingStats, setPingStats] = useState<PingStats | null>(null)
  const [pingHistory, setPingHistory] = useState<PingHistoryItem[]>([])
  const [pingDirection, setPingDirection] = useState<'received' | 'sent'>('received')
  const [pingLoading, setPingLoading] = useState(false)
  const [pingHasMore, setPingHasMore] = useState(true)
  const cursorRef = useRef<string | null>(null)
  const loadingRef = useRef(false)
  
  // 서브 탭 선택 상태 ('ping' 혹은 'touch')
  const [activeSubTab, setActiveSubTab] = useState<'ping' | 'touch'>('ping')

  // [Touch/Ping 2원 체계] Touch 통계
  const [touchStats, setTouchStats] = useState<TouchStats | null>(null)
  const [touchHistory, setTouchHistory] = useState<TouchHistoryItem[]>([])
  const [touchLoading, setTouchLoading] = useState(false)

  // 핑 히스토리 로드 (cursor 기반)
  const fetchPings = useCallback(async (reset = false) => {
    if (loadingRef.current && !reset) return
    loadingRef.current = true
    setPingLoading(true)

    try {
      const params = new URLSearchParams()
      params.append('direction', pingDirection)
      params.append('limit', PING_LIMIT.toString())
      if (galaxyKey) params.append('galaxy', galaxyKey)
      if (!reset && cursorRef.current) {
        params.append('cursor', cursorRef.current)
      }

      const res = await fetch(`/api/pings/history?${params.toString()}`)
      const data = await res.json()

      if (res.ok) {
        const pings = data.pings || []
        if (reset) {
          setPingHistory(pings)
        } else {
          setPingHistory(prev => [...prev, ...pings])
        }
        setPingStats(data.stats || null)
        setPingHasMore(data.hasMore ?? false)
        cursorRef.current = data.nextCursor || null
      }
    } catch (e) {
      console.error('[SettingsPingView] Ping fetch error:', e)
    } finally {
      loadingRef.current = false
      setPingLoading(false)
    }
  }, [pingDirection, galaxyKey])

  // 방향 전환 시 리셋
  useEffect(() => {
    cursorRef.current = null
    setPingHistory([])
    setPingHasMore(true)
    fetchPings(true)
  }, [pingDirection, fetchPings])

  // [Touch/Ping 2원 체계] Touch 통계 로드
  useEffect(() => {
    setTouchLoading(true)
    const touchUrl = galaxyKey ? `/api/touches?galaxy=${galaxyKey}` : '/api/touches'
    fetch(touchUrl)
      .then(r => r.json())
      .then(data => {
        setTouchStats(data.stats || null)
        setTouchHistory(data.recentTouches || [])
        setTouchLoading(false)
      })
      .catch(e => {
        console.error('[SettingsPingView] Touch fetch error:', e)
        setTouchLoading(false)
      })
  }, [galaxyKey])

  // 무한 스크롤 — 공통 훅 useIntersectionObserver 사용
  const { sentinelRef } = useIntersectionObserver({
    onIntersect: () => fetchPings(false),
    enabled: pingHasMore && !pingLoading,
  })

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('justNow')
    if (mins < 60) return t('minutesAgo', { m: mins })
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return t('hoursAgo', { h: hrs })
    const days = Math.floor(hrs / 24)
    if (days < 7) return t('daysAgo', { days })
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  const getPingLabel = (typeId: string) => {
    return PING_TYPES.find(p => p.id === typeId)?.label || typeId
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── 서브 탭 컨트롤 ── */}
      <div className="flex gap-1.5 border-b border-white/5 pb-3">
        <button
          onClick={() => setActiveSubTab('ping')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'ping'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('pingDetail') || '핑 내역'}
        </button>
        <button
          onClick={() => setActiveSubTab('touch')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'touch'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('recentTouches') || '터치 내역'}
        </button>
      </div>

      {activeSubTab === 'ping' && (
        <div className="space-y-6">
          {/* 통계 카드 — 3열 (터치 + 핑) */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
              <p className="text-2xl font-black text-white tabular-nums">{touchStats?.totalReceived?.toLocaleString() ?? 0}</p>
              <p className="text-[12px] font-bold text-white/90 uppercase mt-1">{t('receivedTouches')}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
              <p className="text-2xl font-black text-white tabular-nums">{pingStats?.totalSent?.toLocaleString() ?? 0}</p>
              <p className="text-[12px] font-bold text-white/90 uppercase mt-1">{t('sentPings')}</p>
            </div>
            <div className="p-4 rounded-2xl bg-[rgba(var(--theme-rgb-light),0.12)] border border-[rgba(var(--theme-rgb-light),0.25)] text-center">
              <p className="text-2xl font-black text-white tabular-nums">{pingStats?.totalReceived?.toLocaleString() ?? 0}</p>
              <p className="text-[12px] font-bold text-white/90 uppercase mt-1">{t('receivedPings')}</p>
            </div>
          </div>

          {/* 유형별 분포 */}
          {pingStats && Object.keys(pingStats.typeDistribution).length > 0 && (
            <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
              <p className="text-xs font-bold text-white/90 mb-3">{t('topEmotionTypes')}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(pingStats.typeDistribution)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 8)
                  .map(([type, count]) => (
                    <span key={type} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-white">
                      {getPingLabel(type)} <span className="text-white ml-1 tabular-nums">{count}</span>
                    </span>
                  ))
                }
              </div>
            </div>
          )}

          {/* 핑 리스트 컨트롤 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-white">{t('pingDetail')}</h3>
              <div className="flex bg-white/[0.03] border border-white/10 p-1 rounded-xl">
                <button
                  onClick={() => setPingDirection('received')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                    pingDirection === 'received' ? 'bg-white/15 text-white shadow-sm border border-white/20' : 'text-white/90 hover:text-white'
                  }`}
                >
                  <Inbox className="w-3.5 h-3.5" /> {t('receivedHistory')}
                </button>
                <button
                  onClick={() => setPingDirection('sent')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                    pingDirection === 'sent' ? 'bg-white/15 text-white shadow-sm border border-white/20' : 'text-white/90 hover:text-white'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" /> {t('sentHistory')}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden min-h-[300px]">
              {pingLoading && pingHistory.length === 0 ? (
                <div className="flex items-center justify-center p-12">
                  <LogoSpinner size={48} variant="white" />
                </div>
              ) : pingHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <Inbox className="w-12 h-12 text-white/30 mb-3" />
                  <p className="text-sm text-white/90 font-medium">{t('noPingHistory')}</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {pingHistory.map(ping => (
                    <div key={ping.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition">
                      <div className="flex items-center gap-4">
                        <div className="flex shrink-0 items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10">
                          {ping.isCrystal ? <Gem className="w-4 h-4 text-white/90" /> : <Sparkles className="w-4 h-4 text-white/90" />}
                        </div>
                        <div>
                          <p className="text-[16px] font-bold text-white mb-1">
                            <span className="text-white/90 mr-2">{getPingLabel(ping.pingType)}</span>
                            {ping.partner.displayName}
                          </p>
                          <p className="text-sm text-white/85">
                            {pingDirection === 'received' ? t('sender') : t('receiver')}
                            {ping.momentPreview && <span className="ml-2 text-white/90">「{ping.momentPreview}…」</span>}
                          </p>
                        </div>
                      </div>
                      <span className="text-[12px] font-medium text-white/90 tabular-nums">{formatTime(ping.createdAt)}</span>
                    </div>
                  ))}

                  {/* 무한 스크롤 감지 포인트 */}
                  <div ref={sentinelRef} className="h-4" />

                  {pingLoading && pingHistory.length > 0 && (
                    <div className="flex items-center justify-center py-3">
                      <LogoSpinner size={32} variant="white" />
                      <span className="text-[12px] text-white/85 font-medium ml-2">{t('loadingMore')}</span>
                    </div>
                  )}

                  {!pingHasMore && pingHistory.length > 0 && (
                    <p className="text-[12px] text-white/45 text-center py-3 font-medium">{t('allHistoryShown')}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'touch' && (
        <div className="space-y-4">
          <h3 className="text-[16px] font-bold text-white mb-3">{t('recentTouches')}</h3>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {touchLoading ? (
              <div className="flex justify-center p-8"><LogoSpinner size={48} variant="white" /></div>
            ) : touchHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Hand className="w-12 h-12 text-white/30 mb-3" />
                <p className="text-sm text-white/90 font-medium">{t('noTouchHistory') || '최근 터치 내역이 없습니다.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {touchHistory.map(touch => (
                  <div key={touch.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition">
                    <div className="flex items-center gap-3">
                      <div className="flex shrink-0 items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10">
                        <Hand className="w-3.5 h-3.5 text-white/85" />
                      </div>
                      <p className="text-sm font-bold text-white">{touch.toucher.displayName}</p>
                    </div>
                    <span className="text-[12px] font-medium text-white/90 tabular-nums">{formatTime(touch.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
