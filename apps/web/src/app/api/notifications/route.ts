import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { getNotifications, getUnreadNotificationCount, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '@/shared/services/notificationService'

/**
 * GET /api/notifications
 * 유저의 알림 목록 및 읽지 않은 개수를 반환합니다.
 * 
 * Query: ?cursor=uuid (페이징), ?countOnly=true (개수만)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true },
    })
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const countOnly = searchParams.get('countOnly') === 'true'

    if (countOnly) {
      const unreadCount = await getUnreadNotificationCount(dbUser.id)
      return NextResponse.json({ unreadCount })
    }

    const cursor = searchParams.get('cursor') || undefined
    const result = await getNotifications(dbUser.id, cursor)
    const unreadCount = await getUnreadNotificationCount(dbUser.id)

    return NextResponse.json({ ...result, unreadCount })
  } catch (error) {
    console.error('[notifications] GET Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH /api/notifications
 * 알림 읽음 처리
 * 
 * Body: { notificationId: string } 또는 { markAll: true }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true },
    })
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()

    if (body.markAll) {
      await markAllNotificationsAsRead(dbUser.id)
    } else if (body.notificationId) {
      await markNotificationAsRead(body.notificationId, dbUser.id)
    } else {
      return NextResponse.json({ error: 'Missing notificationId or markAll' }, { status: 400 })
    }

    const unreadCount = await getUnreadNotificationCount(dbUser.id)
    return NextResponse.json({ success: true, unreadCount })
  } catch (error) {
    console.error('[notifications] PATCH Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/notifications
 * 알림 삭제
 * 
 * Body: { notificationId: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true },
    })
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()

    if (!body.notificationId || typeof body.notificationId !== 'string') {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 })
    }

    await deleteNotification(body.notificationId, dbUser.id)

    const unreadCount = await getUnreadNotificationCount(dbUser.id)
    return NextResponse.json({ success: true, unreadCount })
  } catch (error) {
    console.error('[notifications] DELETE Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
