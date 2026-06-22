import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export const dynamic = 'force-dynamic'

// ──────────────────────────────────────────────────────────────
// GET /api/users/push-settings — 현재 푸시 알림 설정 조회
// ──────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        push_touch_enabled: true,
        push_ping_enabled: true,
        push_comment_enabled: true,
        push_bond_enabled: true,
        push_subscription_enabled: true,
        push_dm_enabled: true,
        push_marketing_enabled: true,
      },
    })

    if (!settings) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: settings })
  } catch (error) {
    console.error('[GET /api/users/push-settings] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────
// PATCH /api/users/push-settings — 푸시 알림 설정 업데이트
// ──────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // 허용된 필드만 추출 (whitelist 방식)
    const allowedFields = [
      'push_touch_enabled',
      'push_ping_enabled',
      'push_comment_enabled',
      'push_bond_enabled',
      'push_subscription_enabled',
      'push_dm_enabled',
      'push_marketing_enabled',
    ] as const

    const updateData: Record<string, boolean> = {}
    for (const field of allowedFields) {
      if (typeof body[field] === 'boolean') {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        push_touch_enabled: true,
        push_ping_enabled: true,
        push_comment_enabled: true,
        push_bond_enabled: true,
        push_subscription_enabled: true,
        push_dm_enabled: true,
        push_marketing_enabled: true,
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('[PATCH /api/users/push-settings] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
