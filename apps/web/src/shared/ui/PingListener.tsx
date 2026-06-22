'use client'

import { useEffect } from 'react'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { createClient } from '@/shared/lib/supabase/browser'
import { useToastStore } from '@/stores/toastStore'
import { PING_TYPES } from '@/shared/constants/pings'
import { useTranslations } from 'next-intl'

/**
 * PingListener + ConstellationListener
 * Supabase Realtime broadcast 이벤트를 구독하여 토스트 알림을 표시합니다.
 *
 * 구독 채널:
 *   - user-ping-{userId}           : 핑 수신 알림
 *   - user-constellation-{userId}  : 별자리 연결 요청/수락 알림
 */
export function PingListener() {
  const currentUser = useUserStore((s) => s.user)
  const isHydrated = useUserStore((s) => s.isHydrated)
  const addToast = useToastStore((s) => s.addToast)
  const tN = useTranslations('Notification')

  useEffect(() => {
    if (!isHydrated || !currentUser) return

    const supabase = createClient()

    // ── 채널 1: 핑 수신 ────────────────────────────────────────
    const pingChannelName = `user-ping-${currentUser.id}`
    const pingChannel = supabase.channel(pingChannelName)

    pingChannel
      .on('broadcast', { event: 'new-ping' }, (payload: { payload: { sender_name?: string; ping_type?: string } }) => {
        const { sender_name, ping_type } = payload.payload

        const pingDef = PING_TYPES.find(p => p.id === ping_type)
        const title = tN('pingArrived', { name: sender_name || tN('someone'), label: pingDef?.label || tN('pingDefault') })
        const message = pingDef?.emotionalMessage || tN('pingDefaultMessage')

        addToast({ title, message, type: 'success' })
      })
      .subscribe()

    // ── 채널 2: 별자리 연결 요청/수락 알림 ─────────────────────
    const constellationChannelName = `user-constellation-${currentUser.id}`
    const constellationChannel = supabase.channel(constellationChannelName)

    constellationChannel
      .on('broadcast', { event: 'constellation-request' }, (payload: { payload: { sender_name?: string } }) => {
        const { sender_name } = payload.payload
        addToast({
          title: tN('bondRequestTitle', { name: sender_name || tN('someone') }),
          message: tN('bondRequestMessage'),
          type: 'info',
          duration: 6000,
        })
      })
      .on('broadcast', { event: 'constellation-accepted' }, (payload: { payload: { acceptor_name?: string } }) => {
        const { acceptor_name } = payload.payload
        addToast({
          title: tN('bondAcceptTitle', { name: acceptor_name || tN('someone') }),
          message: tN('bondAcceptMessage'),
          type: 'success',
          duration: 5000,
        })
      })
      .subscribe()

    // ── 채널 3: 터치 수신 ────────────────────────────────────────
    const touchChannelName = `user-touch-${currentUser.id}`
    const touchChannel = supabase.channel(touchChannelName)

    touchChannel
      .on('broadcast', { event: 'new-touch' }, (payload: { payload: { toucher_name?: string } }) => {
        const { toucher_name } = payload.payload
        addToast({
          title: tN('touchTitle', { name: toucher_name || tN('someone') }),
          message: tN('touchMessage'),
          type: 'info',
        })
      })
      .subscribe()

    // ── COMMENT/SUBSCRIPTION/DM 알림 토스트 (전역 이벤트 수신) ──
    const handleNotificationUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ type?: string; toast?: { title: string; body?: string } }>
      if (!customEvent.detail) return

      const { type, toast } = customEvent.detail
      if (!toast) return  // toast 데이터 없으면 무시 (뱃지 전용 업데이트)
      // TOUCH/PING/BOND는 전용 채널에서 이미 토스트 표시 → 중복 방지
      if (type === 'TOUCH' || type === 'PING' || type === 'BOND') return

      const toastTypeMap: Record<string, 'info' | 'success'> = {
        COMMENT: 'info',
        SUBSCRIPTION: 'success',
        DM: 'info',
      }
      addToast({
        title: toast.title,
        message: toast.body,
        type: toastTypeMap[type || ''] || 'info',
      })
    }

    window.addEventListener('REALTIME_NOTIFICATION_UPDATE', handleNotificationUpdate)

    return () => {
      supabase.removeChannel(pingChannel)
      supabase.removeChannel(constellationChannel)
      supabase.removeChannel(touchChannel)
      window.removeEventListener('REALTIME_NOTIFICATION_UPDATE', handleNotificationUpdate)
    }
  }, [currentUser, isHydrated, addToast])

  return null
}
