'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver'
import { useTranslations } from 'next-intl'

interface StardustTx {
  id: string
  type: string
  amount: number
  balance_after: number | null
  category: string
  description: string | null
  created_at: string
}

interface SettingsWalletViewProps {
  userProfile: Record<string, any> | null
}

const WALLET_LIMIT = 20

export function SettingsWalletView({ userProfile }: SettingsWalletViewProps) {
  const t = useTranslations('Settings')
  const [stardustTxs, setStardustTxs] = useState<StardustTx[]>([])
  const [stardustLoading, setStardustLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const cursorRef = useRef<string | null>(null)
  const loadingRef = useRef(false)

  const fetchTransactions = useCallback(async (reset = false) => {
    if (loadingRef.current && !reset) return
    loadingRef.current = true
    setStardustLoading(true)

    try {
      const params = new URLSearchParams()
      params.append('limit', WALLET_LIMIT.toString())
      if (!reset && cursorRef.current) {
        params.append('cursor', cursorRef.current)
      }

      const res = await fetch(`/api/stardust/history?${params.toString()}`)
      const data = await res.json()

      if (res.ok) {
        const txs = data.transactions || []
        if (reset) {
          setStardustTxs(txs)
        } else {
          setStardustTxs(prev => [...prev, ...txs])
        }
        setHasMore(data.hasMore ?? false)
        cursorRef.current = data.nextCursor || null
      }
    } catch (e) {
      console.error('[SettingsWalletView] Fetch error:', e)
    } finally {
      loadingRef.current = false
      setStardustLoading(false)
    }
  }, [])

  // 초기 로드
  useEffect(() => {
    cursorRef.current = null
    setStardustTxs([])
    setHasMore(true)
    fetchTransactions(true)
  }, [fetchTransactions])

  // 무한 스크롤 — 공통 훅 useIntersectionObserver 사용
  const { sentinelRef } = useIntersectionObserver({
    onIntersect: () => fetchTransactions(false),
    enabled: hasMore && !stardustLoading,
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
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 마스터 배너 */}
      <div className="relative overflow-hidden p-5 rounded-2xl bg-white/5 border border-white/10">
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium text-white/85 uppercase tracking-wider mb-1">{t('totalStardust')}</h3>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-white tabular-nums drop-shadow-md">
                {(userProfile?.stardust_balance ?? 0).toLocaleString()}
              </span>
              <span className="text-xs font-medium text-white/85">SD</span>
            </div>
          </div>

          {/* 등급 정보 */}
          <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-right">
            <p className="text-[12px] font-bold text-white/85 uppercase tracking-widest mb-0.5">{t('supernovaTier')}</p>
            <p className="text-sm font-black text-[rgb(var(--theme-rgb-light))]">
              {userProfile?.supernova_tier || 'MEMBER'}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[16px] font-bold text-white mb-4">{t('txHistory')}</h3>
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden min-h-[300px]">
          {stardustLoading && stardustTxs.length === 0 ? (
            <div className="flex items-center justify-center p-12">
              <LogoSpinner size={48} variant="white" />
            </div>
          ) : stardustTxs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Wallet className="w-12 h-12 text-white/85 mb-3" />
              <p className="text-sm text-white/90 font-medium">{t('noTransactions')}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {stardustTxs.map(tx => {
                const isSpend = tx.type === 'SPEND'
                return (
                  <div key={tx.id} className="flex items-center justify-between p-5 hover:bg-white/5 transition">
                    <div className="flex items-center gap-4">
                      <div className="flex shrink-0 items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10 text-white/90">
                        {isSpend ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-normal text-white mb-1">{tx.description || tx.category}</p>
                        <p className="text-xs text-white/85 tabular-nums">{formatTime(tx.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-normal tabular-nums ${isSpend ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isSpend ? '-' : '+'}{tx.amount.toLocaleString()} SD
                      </p>
                      {tx.balance_after != null && (
                        <p className="text-xs text-white/85 font-normal mt-1 tabular-nums">{t('balanceAfter', { amount: tx.balance_after.toLocaleString() })}</p>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* 무한 스크롤 감지 포인트 */}
              <div ref={sentinelRef} className="h-4" />

              {stardustLoading && stardustTxs.length > 0 && (
                <div className="flex items-center justify-center py-3">
                  <LogoSpinner size={24} variant="white" />
                  <span className="text-[12px] text-white/85 font-medium ml-2">{t('loadingMore')}</span>
                </div>
              )}

              {!hasMore && stardustTxs.length > 0 && (
                <p className="text-[12px] text-white/85 text-center py-3 font-medium">{t('allHistoryShown')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
