'use client'

import useSWR from 'swr'
import { useEffect } from 'react'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { createClient } from '@/shared/lib/supabase/browser'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * 읽지 않은 알림 개수를 실시간으로 추적하는 훅.
 * - Supabase Realtime broadcast 수신 → 즉시 SWR mutate (0초 지연)
 * - 30초 간격 백업 폴링 유지 (연결 끊김 대비)
 * - 네이티브 하단 탭 뱃지 동기화에도 사용됩니다.
 */
export function useNotificationCount() {
  const user = useUserStore((s) => s.user)

  const { data, mutate } = useSWR(
    user ? '/api/notifications?countOnly=true' : null,
    fetcher,
    {
      refreshInterval: 30_000,  // 백업: 30초 폴링 유지
      revalidateOnFocus: false, // Supabase Realtime broadcast로 즉시 갱신하므로 포커스 재검증 불필요
      dedupingInterval: 10_000, // 10초 이내 중복 요청 방지
    }
  )

  // [실시간] Supabase broadcast 수신 → 즉시 mutate
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase.channel(`user-notifications-${user.id}`)

    channel
      .on('broadcast', { event: 'notification-count-update' }, (payload: { payload: { type?: string; toast?: { title: string; body?: string } } }) => {
        mutate() // SWR 캐시 즉시 갱신
        const event = new CustomEvent('REALTIME_NOTIFICATION_UPDATE', {
          detail: payload.payload,
        })
        window.dispatchEvent(event)
      })
      .on('broadcast', { event: 'new-room' }, () => {
        // 대화방 목록 API 캐시도 함께 강제 갱신(mutate)
        import('swr').then(({ mutate: swrMutate }) => {
          swrMutate('/api/dm/rooms')
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, mutate])

  const unreadCount: number = data?.unreadCount ?? 0

  return { unreadCount, refreshCount: mutate }
}
