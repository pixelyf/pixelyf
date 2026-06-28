import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscriptions/bonds
 * 내 구독 관계(내가 구독 중인 + 나를 구독 중인) Bond 데이터 — 황금 연결선 렌더링용
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ bonds: [] })
    }

    // 활성 구독 관계 조회 (내가 구독 중 + 나를 구독 중)
    const activeSubs = await prisma.thought_subscriptions.findMany({
      where: {
        status: 'active',
        OR: [
          { expires_at: null },
          { expires_at: { gt: new Date() } }
        ],
        AND: [
          {
            OR: [
              { subscriber_id: user.id },
              { creator_id: user.id },
            ]
          }
        ]
      },
      select: {
        subscriber_id: true,
        creator_id: true,
      }
    })

    const bonds = activeSubs.map(s => ({
      subscriberId: s.subscriber_id,
      creatorId: s.creator_id,
    }))

    return NextResponse.json({ bonds })
  } catch (error) {
    console.error('[Subscriptions Bonds] Error:', error)
    return NextResponse.json({ bonds: [] })
  }
}
