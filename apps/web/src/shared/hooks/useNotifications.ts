'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNotificationCount } from '@/shared/hooks/useNotificationCount'
import type { LucideIcon } from 'lucide-react'
import {
  Hand, Zap, MessageCircle, Users, Megaphone, BookOpen, Mail, Pin,
} from 'lucide-react'

// ── 타입 ──
export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
  actor_id: string | null
}

// ── 카테고리 필터 ──
export const NOTIFICATION_FILTER_TABS = [
  { key: 'ALL', labelKey: 'filterAll' },
  { key: 'INTERACTION', labelKey: 'filterInteraction' },
  { key: 'SOCIAL', labelKey: 'filterSocial' },
  { key: 'SUBSCRIPTION', labelKey: 'filterSubscription' },
] as const

export const NOTIFICATION_FILTER_MAP: Record<string, string[]> = {
  ALL: [],
  INTERACTION: ['TOUCH', 'PING'],
  SOCIAL: ['COMMENT', 'BOND'],
  SUBSCRIPTION: ['SUBSCRIPTION'],
}

// ── 알림 타입별 Lucide 아이콘 매핑 ──
export const NOTIFICATION_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  TOUCH: Hand,
  PING: Zap,
  COMMENT: MessageCircle,
  BOND: Users,
  SYSTEM: Megaphone,
  SUBSCRIPTION: BookOpen,
  DM: Mail,
}

export const NOTIFICATION_FALLBACK_ICON = Pin

// ── 알림 목록 관리 훅 ──
interface UseNotificationsOptions {
  /** 훅 활성화 여부 (예: 드로어 열림 상태) */
  enabled?: boolean
}

export function useNotifications({ enabled = true }: UseNotificationsOptions = {}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [filter, setFilter] = useState<string>('ALL')
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)
  const [hasMore, setHasMore] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const cursorRef = useRef<string | null>(null)
  const { refreshCount } = useNotificationCount()

  // ── 알림 목록 로드 ──
  const fetchNotifications = useCallback(async (reset = false) => {
    if (loadingRef.current) return  // useRef로 stale closure 방지
    loadingRef.current = true
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (!reset && cursorRef.current) {
        params.set('cursor', cursorRef.current)
      }

      const res = await fetch(`/api/notifications?${params}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()

      const items = data.notifications || []
      if (reset) {
        setNotifications(items)
      } else {
        setNotifications(prev => [...prev, ...items])
      }

      const nextCursor = data.nextCursor || null
      cursorRef.current = nextCursor
      setHasMore(!!nextCursor)
    } catch (e) {
      console.error('[useNotifications] fetch error:', e)
    } finally {
      loadingRef.current = false
      setIsLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // enabled가 true로 전환될 때 데이터 로드
  useEffect(() => {
    if (enabled) {
      cursorRef.current = null
      setHasMore(true)
      fetchNotifications(true)
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 모두 읽음 ──
  const handleMarkAllRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      refreshCount()
    } catch (e) {
      console.error('[useNotifications] markAll error:', e)
    }
  }, [refreshCount])

  // ── 개별 읽음 ──
  const handleRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      refreshCount()
    } catch (e) {
      console.error('[useNotifications] read error:', e)
    }
  }, [refreshCount])

  // ── 개별 삭제 ──
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      })
      setNotifications(prev => prev.filter(n => n.id !== id))
      refreshCount()
    } catch (e) {
      console.error('[useNotifications] delete error:', e)
    } finally {
      setDeletingId(null)
    }
  }, [refreshCount])

  // ── 수동 새로고침 ──
  const refresh = useCallback(() => {
    cursorRef.current = null
    setHasMore(true)
    fetchNotifications(true)
  }, [fetchNotifications])

  // ── 필터링 ──
  const filtered = filter === 'ALL'
    ? notifications
    : notifications.filter(n => NOTIFICATION_FILTER_MAP[filter]?.includes(n.type))

  const unreadCount = notifications.filter(n => !n.is_read).length

  return {
    notifications,
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
  }
}
