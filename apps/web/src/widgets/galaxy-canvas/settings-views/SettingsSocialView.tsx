'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { UserMinus, CheckCircle2, XCircle } from 'lucide-react'
import { galaxyConfirm, galaxyAlert } from '@/stores/dialogStore'
import { useGalaxyStore, type ConstellationBond, type SocialBondsState } from '@/stores/galaxyStore'
import { useTranslations } from 'next-intl'

/** 소셜 설정 View
 * 전역 상태(galaxyStore.socialBonds)를 구독하여 렌더링합니다.
 * - 데이터 소스: /api/constellation GET
 * - 캐시 유효 시간: 30초 (빠른 재진입 시 API 호출 스킵)
 * - 수락/거절/취소/해제 액션은 즉시 전역 상태 업데이트 후 refetch
 */

const CACHE_TTL_MS = 30_000

interface BlockEntry {
  id: string
  blockedId: string
  displayName: string
}

export function SettingsSocialView({ galaxyKey: galaxyKeyProp }: { galaxyKey?: string | null } = {}) {
  const t = useTranslations('Settings')
  const storeGalaxyKey = useGalaxyStore((s) => s.galaxyKey)
  const galaxyKey = galaxyKeyProp ?? storeGalaxyKey
  const socialBonds = useGalaxyStore((s) => s.socialBonds)
  const setSocialBonds = useGalaxyStore((s) => s.setSocialBonds)
  const setBonds = useGalaxyStore((s) => s.setBonds)  // canvas 렌더링 동기화

  const [blocks, setBlocks] = useState<BlockEntry[]>([])
  const [socialLoading, setSocialLoading] = useState(false)
  const [actionLock, setActionLock] = useState(false)

  // 서브 탭 상태 ('connected' | 'received' | 'sent' | 'blocked')
  const [activeSubTab, setActiveSubTab] = useState<'connected' | 'received' | 'sent' | 'blocked'>('connected')

  // ── 데이터 fetch (캐시 TTL 적용) ─────────────────────────
  const fetchData = useCallback(async (force = false) => {
    const now = Date.now()
    const isCacheValid = socialBonds.lastFetched && (now - socialBonds.lastFetched) < CACHE_TTL_MS
    if (!force && isCacheValid) return  // 캐시 유효 → 스킵

    setSocialLoading(true)
    try {
      const bondUrl = galaxyKey ? `/api/constellation?galaxy=${galaxyKey}` : '/api/constellation'
      const [blockRes, bondRes] = await Promise.all([
        fetch('/api/blocks'),
        fetch(bondUrl),
      ])
      const [blockData, bondData] = await Promise.all([
        blockRes.json(),
        bondRes.json(),
      ])

      const newSocialBonds: SocialBondsState = {
        bonds: bondData.bonds || [],
        pendingReceived: bondData.pendingReceived || [],
        pendingSent: bondData.pendingSent || [],
        lastFetched: Date.now(),
      }
      setSocialBonds(newSocialBonds)

      // galaxy canvas의 bonds도 동기화 (accepted만)
      setBonds(bondData.bonds || [])

      setBlocks(blockData.blocks || [])
    } catch (e: any) {
      console.error('[SettingsSocialView] Fetch error:', e)
    } finally {
      setSocialLoading(false)
    }
  }, [socialBonds.lastFetched, setSocialBonds, setBonds])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── 요청 승인 ─────────────────────────────────────────────
  const handleAccept = async (bondId: string) => {
    if (actionLock) return
    setActionLock(true)
    // 낙관적 업데이트: 즉시 목록에서 제거
    const prevBonds = { ...socialBonds }
    setSocialBonds({
      ...socialBonds,
      pendingReceived: socialBonds.pendingReceived.filter((b: any) => b.id !== bondId),
    })
    try {
      const res = await fetch('/api/constellation/respond', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bondId, action: 'accept' }),
      })
      if (!res.ok) throw new Error('API request failed')
      await fetchData(true)
    } catch (e) {
      console.error('[Social] Accept error:', e)
      setSocialBonds(prevBonds) // 롤백
      await galaxyAlert({ title: t('acceptFailed'), message: t('acceptFailed'), variant: 'error' })
    } finally {
      setActionLock(false)
    }
  }

  // ── 요청 거절 ─────────────────────────────────────────────
  const handleReject = async (bondId: string) => {
    if (actionLock) return
    setActionLock(true)
    // 낙관적 업데이트
    const prevBonds = { ...socialBonds }
    setSocialBonds({
      ...socialBonds,
      pendingReceived: socialBonds.pendingReceived.filter((b: any) => b.id !== bondId),
    })
    try {
      const res = await fetch('/api/constellation/respond', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bondId, action: 'reject' }),
      })
      if (!res.ok) throw new Error('API request failed')
      await fetchData(true)
    } catch (e) {
      console.error('[Social] Reject error:', e)
      setSocialBonds(prevBonds) // 롤백
      await galaxyAlert({ title: t('rejectFailed'), message: t('rejectFailed'), variant: 'error' })
    } finally {
      setActionLock(false)
    }
  }

  // ── 요청 취소 (보낸 요청) ─────────────────────────────────
  const handleCancelRequest = async (bondId: string, displayName: string) => {
    if (actionLock) return
    const ok = await galaxyConfirm({
      title: t('cancelRequestTitle'),
      message: t('cancelRequestMsg', { name: displayName }),
      variant: 'warning',
      confirmText: t('cancelRequestBtn'),
      confirmDanger: true,
    })
    if (!ok) return
    setActionLock(true)
    try {
      const res = await fetch('/api/constellation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bondId }),
      })
      if (!res.ok) throw new Error('API request failed')
      await fetchData(true)
    } catch (e) {
      console.error('[Social] Cancel request error:', e)
      await galaxyAlert({ title: t('cancelFailed'), message: t('cancelFailed'), variant: 'error' })
    } finally {
      setActionLock(false)
    }
  }

  // ── 연결 해제 (accepted) ──────────────────────────────────
  const handleDisconnect = async (bondId: string, displayName: string) => {
    if (actionLock) return
    const ok = await galaxyConfirm({
      title: t('disconnectTitle'),
      message: t('disconnectMsg', { name: displayName }),
      variant: 'danger',
      confirmText: t('disconnectBtn'),
      confirmDanger: true,
    })
    if (!ok) return
    setActionLock(true)
    try {
      const res = await fetch('/api/constellation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bondId }),
      })
      if (!res.ok) throw new Error('API request failed')
      await fetchData(true)
    } catch (e) {
      console.error('[Social] Disconnect error:', e)
      await galaxyAlert({ title: t('disconnectFailed'), message: t('disconnectFailed'), variant: 'error' })
    } finally {
      setActionLock(false)
    }
  }

  // ── 차단 해제 ─────────────────────────────────────────────
  const handleUnblock = async (blockedId: string, displayName: string) => {
    if (actionLock) return
    const ok = await galaxyConfirm({
      title: t('unblockTitle'),
      message: t('unblockMsg', { name: displayName }),
      variant: 'info',
      confirmText: t('unblockBtn'),
    })
    if (!ok) return
    setActionLock(true)
    try {
      const res = await fetch('/api/blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: blockedId }),
      })
      if (!res.ok) throw new Error('API request failed')
      setBlocks(prev => prev.filter(b => b.blockedId !== blockedId))
    } catch (e) {
      console.error('[Social] Unblock error:', e)
      await galaxyAlert({ title: t('unblockFailed'), message: t('unblockFailed'), variant: 'error' })
    } finally {
      setActionLock(false)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── 서브 탭 컨트롤 ── */}
      <div className="flex gap-1.5 border-b border-white/5 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSubTab('connected')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'connected'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('connectedPixelers') || '연결된 픽셀리어'} ({socialBonds.bonds.length})
        </button>
        <button
          onClick={() => setActiveSubTab('received')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'received'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('receivedRequests') || '받은 요청'} ({socialBonds.pendingReceived.length})
        </button>
        <button
          onClick={() => setActiveSubTab('sent')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'sent'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('sentRequests') || '보낸 요청'} ({socialBonds.pendingSent.length})
        </button>
        <button
          onClick={() => setActiveSubTab('blocked')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'blocked'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          {t('blockedUsers') || '차단 목록'} ({blocks.length})
        </button>
      </div>

      {/* ── 탭별 콘텐츠 ── */}
      {activeSubTab === 'connected' && (
        <section>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {socialLoading ? (
              <div className="flex justify-center p-8"><LogoSpinner size={48} variant="white" /></div>
            ) : socialBonds.bonds.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <p className="text-sm text-white/85 font-medium">{t('noConnections')}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {socialBonds.bonds.map((bond: any) => (
                  <div key={bond.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-[16px] font-bold text-white/90 truncate block">
                        <span className="text-white/90 mr-1">@</span>{bond.displayName}
                      </span>
                      <span className="text-[12px] text-white/85 mt-0.5 block">{formatDate(bond.createdAt)} {t('connected')}</span>
                    </div>
                    <button disabled={actionLock} onClick={() => handleDisconnect(bond.id, bond.displayName)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-xs font-bold text-black hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                      <UserMinus className="w-3.5 h-3.5 text-black" /> {t('disconnect')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeSubTab === 'received' && (
        <section>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {socialLoading ? (
              <div className="flex justify-center p-8"><LogoSpinner size={48} variant="white" /></div>
            ) : socialBonds.pendingReceived.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <p className="text-sm text-white/85 font-medium">{t('noReceivedRequests')}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {socialBonds.pendingReceived.map((bond: any) => (
                  <div key={bond.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-[16px] font-bold text-white truncate block">
                        <span className="text-white/90 mr-1">✦</span>{bond.displayName}
                      </span>
                      <span className="text-[12px] text-white/85 mt-0.5 block">{formatDate(bond.createdAt)} {t('requested')}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button disabled={actionLock} onClick={() => handleAccept(bond.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs font-bold text-white/90 hover:bg-white/15 transition disabled:opacity-50 disabled:cursor-not-allowed">
                        <CheckCircle2 className="w-3.5 h-3.5" />{t('accept')}
                      </button>
                      <button disabled={actionLock} onClick={() => handleReject(bond.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-xs font-bold text-black hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
                        <XCircle className="w-3.5 h-3.5 text-black" />{t('reject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeSubTab === 'sent' && (
        <section>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {socialLoading ? (
              <div className="flex justify-center p-8"><LogoSpinner size={48} variant="white" /></div>
            ) : socialBonds.pendingSent.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <p className="text-sm text-white/85 font-medium">{t('noSentRequests')}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {socialBonds.pendingSent.map((bond: any) => (
                  <div key={bond.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-[16px] font-bold text-white/90 truncate block">
                        <span className="text-white/90 mr-1">@</span>{bond.displayName}
                      </span>
                      <span className="text-[12px] text-white/85 mt-0.5 block">{formatDate(bond.createdAt)} {t('requested')} · {t('pendingApproval')}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[12px] font-bold text-white/90">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />{t('waiting')}
                      </span>
                      <button disabled={actionLock} onClick={() => handleCancelRequest(bond.id, bond.displayName)}
                        className="px-3 py-1.5 rounded-lg bg-white text-xs font-bold text-black hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
                        {t('cancelRequest')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeSubTab === 'blocked' && (
        <section>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {socialLoading ? (
              <div className="flex justify-center p-8"><LogoSpinner size={48} variant="white" /></div>
            ) : blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <p className="text-sm text-white/85 font-medium">{t('noBlocked')}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {blocks.map(block => (
                  <div key={block.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition">
                    <span className="text-[16px] font-medium text-white">{block.displayName}</span>
                    <button disabled={actionLock} onClick={() => handleUnblock(block.blockedId, block.displayName)}
                      className="px-4 py-1.5 rounded-lg bg-white text-xs font-bold text-black hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
                      {t('unblock')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
