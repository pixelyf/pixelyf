'use client'

import React from 'react'
import {
  BellOff, Check, CheckCheck, Trash2, RefreshCw,
} from 'lucide-react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver'
import {
  useNotifications,
  NOTIFICATION_FILTER_TABS,
  NOTIFICATION_TYPE_ICON_MAP,
  NOTIFICATION_FALLBACK_ICON,
} from '@/shared/hooks/useNotifications'

export function SettingsNotificationView() {
  const t = useTranslations('Settings')
  const locale = useLocale()
  const router = useRouter()

  const {
    filtered,
    filter,
    setFilter,
    isLoading,
    hasMore,
    deletingId,
    unreadCount,
    fetchNotifications,
    handleMarkAllRead,
    handleRead,
    handleDelete,
    refresh,
  } = useNotifications({ enabled: true })

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

  // ── 무한 스크롤 (IntersectionObserver 방식) ──
  const { sentinelRef } = useIntersectionObserver({
    onIntersect: () => fetchNotifications(false),
    enabled: hasMore && !isLoading,
  })

  // ── 알림 클릭 → 딥링크 네비게이션 (P0-1) ──
  const handleNotificationClick = async (notif: { id: string; link: string | null; is_read: boolean }) => {
    // 읽음 처리
    if (!notif.is_read) {
      handleRead(notif.id)
    }
    // 딥링크 이동
    if (notif.link) {
      router.push(notif.link)
    }
  }

  return (
    <div className="space-y-4">

      {/* ── 상단 액션 바 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/90">
            {t('notifUnread')} <span className="text-white font-bold">{unreadCount}</span>{t('notifCount', { count: '' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1 text-[12px] text-white/90 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {t('refresh')}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-[12px] text-white/90 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              {t('markAllRead')}
            </button>
          )}
        </div>
      </div>

      {/* ── 카테고리 필터 탭 ── */}
      <div className="flex gap-1.5">
        {NOTIFICATION_FILTER_TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === key
                ? 'bg-white/15 text-white shadow-sm border border-white/20'
                : 'bg-white/5 text-white/90 border border-white/5 hover:text-white hover:bg-white/[0.07]'
            }`}
          >
            {t(labelKey as any)}
          </button>
        ))}
      </div>

      {/* ── 알림 목록 ── */}
      <div
        className="rounded-xl border border-white/5 bg-white/[0.02]"
      >
        {filtered.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <BellOff className="w-10 h-10 text-white/20" />
            <p className="text-sm text-white/85">{t('noNotifications')}</p>
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
              className={`group flex items-start gap-3 px-4 py-3 border-b border-white/[0.03] transition-all cursor-pointer hover:bg-white/[0.03] ${
                deletingId === notif.id ? 'opacity-20 scale-95' : ''
              }`}
            >
              {/* 타입 아이콘 */}
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                <TypeIcon className="w-4 h-4 text-white/85" />
              </div>

              {/* 콘텐츠 */}
              <div className="flex-1 min-w-0">
                  <div className="flex-start justify-between gap-2">
                    <p className={`text-[16px] leading-snug ${notif.is_read ? 'text-white/85' : 'text-white font-medium'}`}>
                      {notif.title}
                    </p>
                    {!notif.is_read && (
                      <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-rgb-light))] shrink-0 mt-1.5 shadow-[0_0_8px_rgba(var(--theme-rgb-light),0.6)]" />
                    )}
                  </div>
                  {notif.body && (
                    <p className="text-sm text-white/90 mt-0.5 line-clamp-2">{notif.body}</p>
                  )}
                  <p className="text-[12px] text-white/85 mt-1 tabular-nums">{timeAgo(notif.created_at)}</p>
              </div>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                {!notif.is_read && (
                  <button
                    onClick={() => handleRead(notif.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 transition-colors"
                    title={t('markRead')}
                  >
                    <Check className="w-3.5 h-3.5 text-black" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(notif.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 transition-colors"
                  title={t('deleteNotif')}
                >
                  <Trash2 className="w-3.5 h-3.5 text-black" />
                </button>
              </div>
            </div>
          )
        })}

        {/* 무한 스크롤 감지 포인트 */}
        <div ref={sentinelRef} className="h-4" />

        {/* 로딩 스피너 */}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <LogoSpinner size={32} variant="white" />
          </div>
        )}

        {/* 더 이상 없음 */}
        {!hasMore && filtered.length > 0 && !isLoading && (
          <div className="text-center py-4">
            <span className="text-[12px] text-white/85">{t('allNotifLoaded')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
