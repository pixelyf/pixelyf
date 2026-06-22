'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  X, Bell, BellOff, Check, CheckCheck, Trash2, RefreshCw,
} from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import {
  useNotifications,
  NOTIFICATION_FILTER_TABS,
  NOTIFICATION_TYPE_ICON_MAP,
  NOTIFICATION_FALLBACK_ICON,
} from '@/shared/hooks/useNotifications'
import { isNativeApp } from '@/shared/utils/isNativeApp'
import { requestHideTabBar, requestShowTabBar } from '@/shared/lib/bridge'

export function MobileNotificationDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const t = useTranslations('Settings')
  const locale = useLocale()

  const {
    filtered,
    filter,
    setFilter,
    isLoading,
    hasMore,
    deletingId,
    fetchNotifications,
    handleMarkAllRead,
    handleRead,
    handleDelete,
  } = useNotifications({ enabled: isOpen })

  // ── 시간 포맷 (i18n 적용) ──
  function timeAgo(dateStr: string): string {
    const now = Date.now()
    const d = new Date(dateStr).getTime()
    const diff = now - d
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('justNow')
    if (minutes < 60) return t('minutesAgo', { m: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('hoursAgo', { h: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('daysAgo', { days })
    return new Date(dateStr).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }

  // ── 열기/닫기 이벤트 ──
  useEffect(() => {
    const open = () => setIsOpen(true)
    window.addEventListener('OPEN_NOTIFICATION_PANEL', open)
    return () => window.removeEventListener('OPEN_NOTIFICATION_PANEL', open)
  }, [])

  useEffect(() => {
    if (!isNativeApp() || !isOpen) return
    requestHideTabBar()
    return () => requestShowTabBar()
  }, [isOpen])

  // ── 알림 클릭 → 딥링크 네비게이션 (P0-1) ──
  const handleNotificationClick = async (notif: { id: string; link: string | null; is_read: boolean }) => {
    // 읽음 처리
    if (!notif.is_read) {
      handleRead(notif.id)
    }
    // 딥링크 이동
    if (notif.link) {
      setIsOpen(false)
      router.push(notif.link)
    }
  }

  // ── 무한 스크롤 ──
  const handleScroll = () => {
    if (!scrollRef.current || isLoading || !hasMore) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    if (scrollHeight - scrollTop - clientHeight < 200) {
      fetchNotifications(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ backgroundColor: 'rgba(11, 15, 16, 0.98)' }}>
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between px-4 pt-safe" style={{ height: '56px' }}>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-indigo-400" />
          {t('notification')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded-lg active:bg-white/5 transition-colors"
          >
            <CheckCheck className="w-4 h-4 inline mr-1" />
            {t('markAllRead')}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </div>

      {/* ── 카테고리 탭 ── */}
      <div className="flex gap-1 px-4 py-2 overflow-x-auto scrollbar-hide">
        {NOTIFICATION_FILTER_TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filter === key
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-white/5 text-white/50 border border-transparent hover:bg-white/10'
            }`}
          >
            {t(labelKey as any)}
          </button>
        ))}
      </div>

      <div className="h-px w-full bg-white/5" />

      {/* ── 알림 목록 ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        {filtered.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
            <BellOff className="w-12 h-12 text-white/20" />
            <p className="text-sm text-white/40">{t('noNotifications')}</p>
          </div>
        )}

        {filtered.map((notif) => {
          const TypeIcon = NOTIFICATION_TYPE_ICON_MAP[notif.type] || NOTIFICATION_FALLBACK_ICON
          return (
          <div
            key={notif.id}
            onClick={() => handleNotificationClick(notif)}
            role="button"
            tabIndex={0}
            className={`flex items-start gap-3 px-4 py-3 border-b border-white/[0.03] transition-colors cursor-pointer active:bg-white/5 ${
              notif.is_read ? 'opacity-60' : 'bg-white/[0.02]'
            } ${deletingId === notif.id ? 'opacity-30 scale-95 transition-all' : ''}`}
          >
            {/* 타입 아이콘 */}
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
              <TypeIcon className="w-4 h-4 text-white/40" />
            </div>

            {/* 콘텐츠 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm leading-snug ${notif.is_read ? 'text-white/60' : 'text-white/90 font-medium'}`}>
                  {notif.title}
                </p>
                {!notif.is_read && (
                  <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0 mt-1.5" />
                )}
              </div>
              {notif.body && (
                <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{notif.body}</p>
              )}
              <p className="text-[10px] text-white/25 mt-1 tabular-nums">{timeAgo(notif.created_at)}</p>
            </div>

            {/* 액션 버튼 */}
            <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              {!notif.is_read && (
                <button
                  onClick={() => handleRead(notif.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                  title={t('markRead')}
                >
                  <Check className="w-3.5 h-3.5 text-white/30" />
                </button>
              )}
              <button
                onClick={() => handleDelete(notif.id)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
                title={t('deleteNotif')}
              >
                <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400" />
              </button>
            </div>
          </div>
          )
        })}

        {/* 로딩 스피너 */}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
