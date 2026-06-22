'use server'

import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import type { NotificationType } from '@prisma/client'

// ── Expo Push API 상수 ──
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface SendNotificationParams {
  /** 알림을 받을 유저의 UUID */
  userId: string
  /** 알림 타입 */
  type: NotificationType
  /** 알림 제목 */
  title: string
  /** 알림 본문 */
  body: string
  /** 딥링크 URL (푸시 클릭 시 이동할 경로) */
  link?: string
  /** 알림을 발생시킨 유저의 UUID */
  actorId?: string
  /** 관련 리소스(모먼트, 핑 등) UUID */
  resourceId?: string
}

/**
 * 이중 기록 패턴 (Double-Recording):
 * 1. DB에 알림 내역을 저장합니다 (인앱 알림 탭용).
 * 2. Expo Push API를 통해 네이티브 푸시 알림을 발송합니다.
 * 
 * Fire-and-Forget 패턴:
 * - 이 함수는 DB 저장 후 즉시 반환합니다.
 * - 푸시 발송은 비동기로 후처리되어 API 응답 속도를 보장합니다.
 */
export async function sendNotification(params: SendNotificationParams) {
  const { userId, type, title, body, link, actorId, resourceId } = params

  let notification

  // DM 타입이고 이미 읽지 않은 동일 방 알림이 있다면 기존 알림을 덮어씀 (Upsert)
  if (type === 'DM' && resourceId) {
    const existing = await prisma.notification.findFirst({
      where: {
        user_id: userId,
        type: 'DM',
        resource_id: resourceId,
        is_read: false,
      },
    })

    if (existing) {
      notification = await prisma.notification.update({
        where: { id: existing.id },
        data: {
          title,
          body,
          actor_id: actorId,
          created_at: new Date(),
        },
      })
    }
  }

  // 기존 알림이 없어 새로 만들어야 하는 경우
  if (!notification) {
    notification = await prisma.notification.create({
      data: {
        user_id: userId,
        type,
        title,
        body,
        link,
        actor_id: actorId,
        resource_id: resourceId,
      },
    })
  }

  // Step 2: 푸시 발송 (Fire-and-Forget, 비동기 후처리)
  // DB 저장 완료 후 await 없이 발송하여 호출자의 응답 속도에 영향을 주지 않음
  sendExpoPush(userId, title, body, link, type, resourceId).catch((e) => {
    console.error('[NotificationService] Push 발송 실패:', e)
  })

  // Step 3: 실시간 뱃지 갱신 broadcast (Fire-and-Forget)
  broadcastBadgeUpdate(userId, type, { title, body }).catch((e) => {
    console.error('[NotificationService] Badge broadcast 실패:', e)
  })

  return notification
}

/**
 * Expo Push API를 통해 네이티브 푸시 알림을 발송합니다.
 * 유저의 push_enabled가 false이거나 expo_push_token이 없으면 건너뜁니다.
 */
async function sendExpoPush(userId: string, title: string, body: string, link?: string, type?: NotificationType, resourceId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      expo_push_token: true, 
      push_touch_enabled: true,
      push_ping_enabled: true,
      push_comment_enabled: true,
      push_bond_enabled: true,
      push_marketing_enabled: true,
      push_subscription_enabled: true,
      push_dm_enabled: true,
    },
  })

  if (!user?.expo_push_token) return

  // 1. 시스템 알림은 무조건 발송
  // 2. 그 외 타입은 유저 설정 확인
  let shouldSend = false

  switch (type) {
    case 'SYSTEM':
      shouldSend = true
      break
    case 'TOUCH':
      shouldSend = user.push_touch_enabled
      break
    case 'PING':
      shouldSend = user.push_ping_enabled
      break
    case 'COMMENT':
      shouldSend = user.push_comment_enabled
      break
    case 'BOND':
      shouldSend = user.push_bond_enabled
      break
    case 'SUBSCRIPTION':
      shouldSend = user.push_subscription_enabled
      break
    case 'DM':
      shouldSend = user.push_dm_enabled
      break
    default:
      // 기본적으로 알 수 없는 타입은 발송 (혹은 마케팅이면 push_marketing_enabled 체크)
      shouldSend = true
  }

  if (!shouldSend) {
    return // 푸시 설정이 꺼져 있으면 조용히 스킵
  }

  const message: any = {
    to: user.expo_push_token,
    sound: 'default' as const,
    title,
    body,
    data: { url: link || '/' },
  }

  // DM 타입의 연속 알림일 경우 네이티브 모바일 알림 덮어쓰기/그룹화(Collapse) 적용
  if (type === 'DM' && resourceId) {
    message.threadIdentifier = `dm-${resourceId}`
    message.android = {
      collapseKey: `dm-${resourceId}`,
    }
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Expo Push API error: ${res.status} ${errorText}`)
  }
}

/**
 * 유저의 읽지 않은 알림 개수를 반환합니다.
 * 네이티브 하단 탭 뱃지 카운트 동기화에 사용됩니다.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { user_id: userId, is_read: false },
  })
}

/**
 * 유저의 알림 목록을 페이징하여 반환합니다.
 */
export async function getNotifications(userId: string, cursor?: string, limit = 20) {
  const notifications = await prisma.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      link: true,
      actor_id: true,
      is_read: true,
      created_at: true,
    },
  })

  const hasMore = notifications.length > limit
  if (hasMore) notifications.pop()

  return {
    notifications,
    nextCursor: hasMore ? notifications[notifications.length - 1]?.id : null,
  }
}

/**
 * 특정 알림을 읽음 처리합니다.
 */
export async function markNotificationAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, user_id: userId },
    data: { is_read: true },
  })
}

/**
 * 유저의 모든 알림을 읽음 처리합니다.
 */
export async function markAllNotificationsAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { user_id: userId, is_read: false },
    data: { is_read: true },
  })
}

/**
 * 특정 알림을 삭제합니다.
 */
export async function deleteNotification(notificationId: string, userId: string) {
  return prisma.notification.deleteMany({
    where: { id: notificationId, user_id: userId },
  })
}

/**
 * 유저의 읽은 알림 중 특정 기간이 지난 알림을 일괄 삭제합니다.
 * 업계 표준: 90일 보관 후 읽은 알림 자동 정리
 */
export async function purgeOldNotifications(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000)
  return prisma.notification.deleteMany({
    where: {
      is_read: true,
      created_at: { lt: cutoffDate },
    },
  })
}

/**
 * Supabase Realtime broadcast로 뱃지 카운트 갱신 이벤트 발송
 * 클라이언트의 useNotificationCount 훅이 이 이벤트를 수신하여 즉시 SWR mutate 수행
 */
async function broadcastBadgeUpdate(userId: string, type: NotificationType, toastData?: { title: string; body?: string }) {
  const supabase = await createClient()
  const channel = supabase.channel(`user-notifications-${userId}`)
  await channel.send({
    type: 'broadcast',
    event: 'notification-count-update',
    payload: { type, ...(toastData && { toast: toastData }) },
  })
  await supabase.removeChannel(channel)
}
