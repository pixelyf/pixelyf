import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscriptions/status?creatorId=xxx
 * 특정 크리에이터에 대한 내 구독 상태 + 구독 전용 콘텐츠 존재 여부
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ isSubscribed: false, hasSubscriberContent: false })
    }

    const { searchParams } = new URL(request.url)
    const creatorId = searchParams.get('creatorId')

    if (!creatorId) {
      return NextResponse.json({ error: 'creatorId is required' }, { status: 400 })
    }

    // 병렬 조회: 구독 상태 + 구독 전용 콘텐츠 존재 여부
    const [subscription, subContentCount] = await Promise.all([
      prisma.thought_subscriptions.findUnique({
        where: {
          subscriber_id_creator_id: {
            subscriber_id: user.id,
            creator_id: creatorId,
          }
        },
        select: { status: true, expires_at: true }
      }),
      // [마이그레이션 완료] Prisma 네이티브 쿼리로 전환
      prisma.moment.count({
        where: {
          user_id: creatorId,
          is_subscriber_only: true,
          is_deleted: false,
        }
      }),
    ])

    const isActive = subscription?.status === 'active' && (
      !subscription.expires_at || new Date(subscription.expires_at) > new Date()
    )

    return NextResponse.json({
      isSubscribed: !!isActive,
      hasSubscriberContent: subContentCount > 0,
      expiresAt: isActive ? subscription!.expires_at : null,
    })
  } catch (error) {
    console.error('[Subscriptions Status] Error:', error)
    return NextResponse.json({ isSubscribed: false, hasSubscriberContent: false })
  }
}

