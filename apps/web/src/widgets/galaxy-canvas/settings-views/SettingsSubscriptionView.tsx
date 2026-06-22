'use client'

import React, { useState, useEffect } from 'react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { AlertCircle, Users, Wallet, AlertTriangle, Calendar } from 'lucide-react'
import { galaxyConfirm, galaxyAlert } from '@/stores/dialogStore'
import { useTranslations } from 'next-intl'

interface RevenueStats {
  totalEarned: number
  monthlyEarned: number
  activeSubscribers: number
}

interface SubscriberStats {
  currentBalance: number
  totalMonthlyCost: number
  isBalanceLow: boolean
}

/** D-day 계산 (양수 = 남은 일수, 음수 = 초과일) */
function getDday(expiresAt: string | null): number | null {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/** D-day 색상 분류 */
function getDdayColor(dday: number): string {
  if (dday <= 0) return 'text-red-400'
  if (dday <= 3) return 'text-orange-400'
  if (dday <= 7) return 'text-amber-400'
  return 'text-white/90'
}

export function SettingsSubscriptionView() {
  const t = useTranslations('Settings')
  const [mySubscriptions, setMySubscriptions] = useState<{ id: string; creatorId: string; displayName: string; tier: string; monthlyCost: number; expiresAt: string | null }[]>([])
  const [mySubscribers, setMySubscribers] = useState<{ id: string; subscriberId: string; displayName: string; tier: string }[]>([])
  const [revenueStats, setRevenueStats] = useState<RevenueStats>({ totalEarned: 0, monthlyEarned: 0, activeSubscribers: 0 })
  const [subscriberStats, setSubscriberStats] = useState<SubscriberStats>({ currentBalance: 0, totalMonthlyCost: 0, isBalanceLow: false })
  const [subLoading, setSubLoading] = useState(false)
  const [actionLock, setActionLock] = useState(false)

  // 서브 탭 상태 ('mine' | 'creator')
  const [activeSubTab, setActiveSubTab] = useState<'mine' | 'creator'>('mine')

  useEffect(() => {
    const controller = new AbortController()
    setSubLoading(true)
    fetch('/api/subscriptions', { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setMySubscriptions(data.subscriptions || [])
        setMySubscribers(data.subscribers || [])
        setRevenueStats(data.revenueStats || { totalEarned: 0, monthlyEarned: 0, activeSubscribers: 0 })
        setSubscriberStats(data.subscriberStats || { currentBalance: 0, totalMonthlyCost: 0, isBalanceLow: false })
        setSubLoading(false)
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          console.error('[SettingsSubscriptionView] Fetch error:', e)
          setSubLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── 서브 탭 컨트롤 ── */}
      <div className="flex gap-1.5 border-b border-white/5 pb-3">
        <button
          onClick={() => setActiveSubTab('mine')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'mine'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('mySubscriptions', { count: '' }).replace(/[()0-9\s]/g, '') || '내 구독 내역'} ({mySubscriptions.length})
        </button>
        <button
          onClick={() => setActiveSubTab('creator')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'creator'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('mySubscribers', { count: '' }).replace(/[()0-9\s]/g, '') || '내 구독자 목록'} ({mySubscribers.length})
        </button>
      </div>

      {/* ── 탭별 콘텐츠 ── */}
      {activeSubTab === 'mine' && (
        <div className="space-y-6">
          {/* 잔고 부족 경고 배너 */}
          {subscriberStats.isBalanceLow && mySubscriptions.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/25">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[16px] font-bold text-red-300 mb-1">{t('lowBalance')}</p>
                <p className="text-sm text-red-300/90 leading-relaxed">
                  {t('currentBalance')} <span className="font-bold text-white">{subscriberStats.currentBalance.toLocaleString()} SD</span> · 
                  {t('monthlySubCost')} <span className="font-bold text-red-300">{subscriberStats.totalMonthlyCost.toLocaleString()} SD</span>
                  <br />{t('subExpireWarning', { count: mySubscriptions.length })}
                </p>
              </div>
            </div>
          )}

          {/* 내가 구독 중인 생각 */}
          <section>
            <h3 className="text-[16px] font-bold text-white mb-4">{t('mySubscriptions', { count: mySubscriptions.length })}</h3>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              {subLoading ? (
                <div className="flex justify-center p-8"><LogoSpinner size={48} variant="white" /></div>
              ) : mySubscriptions.length === 0 ? (
                <p className="text-sm text-white/85 text-center py-12">{t('noSubscriptions')}</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {mySubscriptions.map(sub => {
                    const dday = getDday(sub.expiresAt)
                    return (
                      <div key={sub.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition">
                        <div>
                          <p className="text-[16px] font-bold text-white mb-1">
                            <span className="text-white/90 mr-1">@</span>{sub.displayName}
                          </p>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-amber-500">{sub.monthlyCost.toLocaleString()} SD/월</span>
                            {dday !== null && (
                              <span className={`text-[12px] font-bold ${getDdayColor(dday)}`}>
                                {dday <= 0 ? t('expired') : `D-${dday}`}
                              </span>
                            )}
                            {sub.expiresAt && dday !== null && dday > 0 && (
                              <span className="text-[12px] text-white/90 font-medium">
                                {t('paymentDate')} {new Date(sub.expiresAt).toLocaleDateString('ko-KR')}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          disabled={actionLock}
                          onClick={async () => {
                            if (actionLock) return
                            const ok = await galaxyConfirm({
                              title: t('unsubscribeTitle'),
                              message: t('unsubscribeMsg', { name: sub.displayName }),
                              variant: 'warning',
                              confirmText: t('unsubscribeBtn'),
                              confirmDanger: true,
                            })
                            if (!ok) return
                            setActionLock(true)
                            try {
                              const res = await fetch('/api/subscriptions', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ subscriptionId: sub.id })
                              })
                              if (!res.ok) throw new Error('API request failed')
                              setMySubscriptions(prev => prev.filter(s => s.id !== sub.id))
                            } catch (e) {
                              console.error('[Subscription] Unsubscribe error:', e)
                              await galaxyAlert({ title: t('unsubscribeFailed'), message: t('unsubscribeFailed'), variant: 'error' })
                            } finally {
                              setActionLock(false)
                            }
                          }}
                          className="px-4 py-1.5 rounded-lg bg-white text-xs font-bold text-black hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('unsubscribe')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeSubTab === 'creator' && (
        <div className="space-y-6">
          {/* 크리에이터 수익 현황 */}
          {(revenueStats.totalEarned > 0 || revenueStats.activeSubscribers > 0) && (
            <section>
              <h3 className="text-[16px] font-bold text-white mb-4">{t('revenueTitle')}</h3>
              <div className="grid grid-cols-3 gap-3">
                {/* 총 누적 수익 */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wallet className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[12px] font-bold text-amber-400/90 uppercase tracking-wider">{t('totalRevenue')}</span>
                  </div>
                  <p className="text-lg font-black text-white">{revenueStats.totalEarned.toLocaleString()}</p>
                  <p className="text-[12px] text-white/85 font-medium">SD</p>
                </div>
                {/* 이번 달 수익 */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[12px] font-bold text-emerald-400/90 uppercase tracking-wider">{t('thisMonth')}</span>
                  </div>
                  <p className="text-lg font-black text-white">{revenueStats.monthlyEarned.toLocaleString()}</p>
                  <p className="text-[12px] text-white/85 font-medium">SD</p>
                </div>
                {/* 활성 구독자 */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[12px] font-bold text-violet-400/90 uppercase tracking-wider">{t('subscribers')}</span>
                  </div>
                  <p className="text-lg font-black text-white">{revenueStats.activeSubscribers}</p>
                  <p className="text-[12px] text-white/85 font-medium">{t('personCount')}</p>
                </div>
              </div>
            </section>
          )}

          {/* 나의 구독자 현황 */}
          <section>
            <h3 className="text-[16px] font-bold text-white mb-4">{t('mySubscribers', { count: mySubscribers.length })}</h3>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              {subLoading ? (
                <div className="flex justify-center p-8"><LogoSpinner size={48} variant="white" /></div>
              ) : mySubscribers.length === 0 ? (
                <div className="flex flex-col items-center p-12">
                  <AlertCircle className="w-8 h-8 text-white/40 mb-3" />
                  <p className="text-sm font-medium text-white/90 text-center">{t('noSubscribers')}<br/><span className="text-xs mt-1 block opacity-70">{t('noSubscribersHint')}</span></p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {mySubscribers.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition">
                      <span className="text-[16px] font-bold text-white/90">
                        <span className="text-amber-500 mr-1">@</span>{sub.displayName}
                      </span>
                      <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-[12px] font-bold">
                        {sub.tier} {t('tierSubscriber', { tier: '' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
