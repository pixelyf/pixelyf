import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { sendNotification } from '@/shared/services/notificationService'

export const dynamic = 'force-dynamic'

const SUBSCRIPTION_COST = 1000 // 기본 월 구독 비용 (스타더스트)
const SUBSCRIPTION_DAYS = 30   // 구독 기간 (일)
const CREATOR_SHARE_RATE = 0.8 // 크리에이터 수익 비율 (80%), 나머지 20%는 소각

// GET: 내 구독 + 내 구독자 조회
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Lazy expiration: 만료된 active 구독을 expired로 업데이트
    await prisma.thought_subscriptions.updateMany({
      where: {
        status: 'active',
        expires_at: { lt: new Date() },
        OR: [
          { subscriber_id: user.id },
          { creator_id: user.id },
        ]
      },
      data: { status: 'expired' }
    })

    // 내가 구독 중인 크리에이터
    const mySubscriptions = await prisma.thought_subscriptions.findMany({
      where: { subscriber_id: user.id, status: 'active' },
      select: {
        id: true,
        creator_id: true,
        tier: true,
        monthly_cost: true,
        started_at: true,
        expires_at: true,
        users_thought_subscriptions_creator_idTousers: {
          select: { display_name: true, pixel_id: true }
        }
      },
      orderBy: { started_at: 'desc' }
    })

    // 나를 구독하는 구독자
    const mySubscribers = await prisma.thought_subscriptions.findMany({
      where: { creator_id: user.id, status: 'active' },
      select: {
        id: true,
        subscriber_id: true,
        tier: true,
        monthly_cost: true,
        started_at: true,
        users_thought_subscriptions_subscriber_idTousers: {
          select: { display_name: true, pixel_id: true }
        }
      },
      orderBy: { started_at: 'desc' }
    })

    // [생각 구독] 크리에이터 수익 합산
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [totalRevenueAgg, monthlyRevenueAgg, userBalance] = await Promise.all([
      // 총 누적 수익
      prisma.stardust_transactions.aggregate({
        where: { user_id: user.id, category: 'SUBSCRIPTION_REVENUE' },
        _sum: { amount: true },
      }),
      // 이번 달 수익
      prisma.stardust_transactions.aggregate({
        where: {
          user_id: user.id,
          category: 'SUBSCRIPTION_REVENUE',
          created_at: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      // 현재 잔고 조회
      prisma.user.findUnique({
        where: { id: user.id },
        select: { stardust_balance: true },
      }),
    ])

    // 구독 비용 합산 (잔고 경고용)
    const totalMonthlyCost = mySubscriptions.reduce((sum, s) => sum + s.monthly_cost, 0)

    return NextResponse.json({
      subscriptions: mySubscriptions.map(s => ({
        id: s.id,
        creatorId: s.creator_id,
        displayName: s.users_thought_subscriptions_creator_idTousers.display_name || '알 수 없는 별',
        pixelId: s.users_thought_subscriptions_creator_idTousers.pixel_id || null,
        tier: s.tier,
        monthlyCost: s.monthly_cost,
        startedAt: s.started_at,
        expiresAt: s.expires_at,
      })),
      subscribers: mySubscribers.map(s => ({
        id: s.id,
        subscriberId: s.subscriber_id,
        displayName: s.users_thought_subscriptions_subscriber_idTousers.display_name || '알 수 없는 별',
        tier: s.tier,
        monthlyCost: s.monthly_cost,
        startedAt: s.started_at,
      })),
      // [생각 구독] 크리에이터 수익 현황
      revenueStats: {
        totalEarned: totalRevenueAgg._sum.amount || 0,
        monthlyEarned: monthlyRevenueAgg._sum.amount || 0,
        activeSubscribers: mySubscribers.length,
      },
      // [생각 구독] 구독자 잔고/비용 현황
      subscriberStats: {
        currentBalance: userBalance?.stardust_balance || 0,
        totalMonthlyCost,
        isBalanceLow: (userBalance?.stardust_balance || 0) < totalMonthlyCost,
      },
    })
  } catch (error) {
    console.error('[Subscriptions GET] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST: 구독 시작
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { creatorId } = await request.json()

    if (!creatorId || typeof creatorId !== 'string') {
      return NextResponse.json({ error: 'creatorId is required' }, { status: 400 })
    }

    if (creatorId === user.id) {
      return NextResponse.json({ error: '자기 자신을 구독할 수 없습니다.' }, { status: 400 })
    }

    // 대상 존재 확인
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { id: true }
    })
    if (!creator) {
      return NextResponse.json({ error: '존재하지 않는 사용자입니다.' }, { status: 404 })
    }

    // 차단 관계 확인 (양방향)
    const blockExists = await prisma.user_blocks.findFirst({
      where: {
        OR: [
          { blocker_id: user.id, blocked_id: creatorId },
          { blocker_id: creatorId, blocked_id: user.id },
        ]
      }
    })
    if (blockExists) {
      return NextResponse.json({ error: '차단 관계에서는 구독할 수 없습니다.' }, { status: 403 })
    }

    // 기존 구독 확인
    const existing = await prisma.thought_subscriptions.findUnique({
      where: {
        subscriber_id_creator_id: {
          subscriber_id: user.id,
          creator_id: creatorId,
        }
      }
    })

    if (existing && existing.status === 'active') {
      return NextResponse.json({ error: '이미 구독 중입니다.' }, { status: 409 })
    }

    // 스타더스트 차감 (Prisma 트랜잭션)
    const expiresAt = new Date(Date.now() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000)

    const newBalance = await prisma.$transaction(async (tx) => {
      const sender = await tx.user.findUnique({
        where: { id: user.id },
        select: { stardust_balance: true }
      })

      if (!sender || sender.stardust_balance < SUBSCRIPTION_COST) {
        throw new Error('Insufficient Stardust')
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { stardust_balance: { decrement: SUBSCRIPTION_COST } }
      })

      if (updated.stardust_balance < 0) {
        throw new Error('Insufficient Stardust')
      }

      // 구독자 지출 거래 기록
      await tx.stardust_transactions.create({
        data: {
          user_id: user.id,
          type: 'SPEND',
          amount: SUBSCRIPTION_COST,
          balance_after: updated.stardust_balance,
          category: 'THOUGHT_SUBSCRIPTION',
          description: `생각 구독 (대상: ${creatorId})`
        }
      })

      // [수익 정산] 크리에이터에게 80% 전달 (20%는 소각 — 인플레이션 억제)
      const creatorRevenue = Math.floor(SUBSCRIPTION_COST * CREATOR_SHARE_RATE)
      const creatorUpdated = await tx.user.update({
        where: { id: creatorId },
        data: { stardust_balance: { increment: creatorRevenue } }
      })

      // 크리에이터 수익 거래 기록
      await tx.stardust_transactions.create({
        data: {
          user_id: creatorId,
          type: 'CHARGE',
          amount: creatorRevenue,
          balance_after: creatorUpdated.stardust_balance,
          category: 'SUBSCRIPTION_REVENUE',
          description: `생각 구독 수익 (구독자: ${user.id})`
        }
      })

      return updated.stardust_balance
    })

    // 구독 생성 또는 재활성화
    if (existing) {
      // cancelled/expired → 재활성화
      await prisma.thought_subscriptions.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          started_at: new Date(),
          expires_at: expiresAt,
          cancelled_at: null,
          monthly_cost: SUBSCRIPTION_COST,
        }
      })
    } else {
      // 신규 생성
      try {
        await prisma.thought_subscriptions.create({
          data: {
            subscriber_id: user.id,
            creator_id: creatorId,
            status: 'active',
            tier: 'basic',
            monthly_cost: SUBSCRIPTION_COST,
            expires_at: expiresAt,
          }
        })
      } catch (insertError) {
        // 구독 생성 실패 → 스타더스트 환불 (보상 트랜잭션)
        try {
          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: { stardust_balance: { increment: SUBSCRIPTION_COST } }
            })
            await tx.stardust_transactions.create({
              data: {
                user_id: user.id,
                type: 'CHARGE',
                amount: SUBSCRIPTION_COST,
                balance_after: newBalance + SUBSCRIPTION_COST,
                category: 'SUBSCRIPTION_REFUND',
                description: `구독 생성 실패 환불`
              }
            })
          })
        } catch (refundError) {
          console.error('[Subscriptions] CRITICAL: Refund failed:', refundError)
        }
        throw insertError
      }
    }

    // [알림 DB+Push] 새 구독자 알림 (크리에이터에게) — 알림 실패가 구독 실패로 이어지면 안 됨
    try {
      const subscriberData = await prisma.user.findUnique({
        where: { id: user.id },
        select: { display_name: true },
      })
      await sendNotification({
        userId: creatorId,
        type: 'SUBSCRIPTION',
        title: `${subscriberData?.display_name || '누군가'}님이 생각을 구독합니다`,
        body: '새로운 구독자가 당신의 생각에 공명했습니다.',
        actorId: user.id,
      })
    } catch (notifError) {
      console.error('[Subscriptions] Notification failed (non-critical):', notifError)
    }

    return NextResponse.json({ success: true, newBalance })
  } catch (error: any) {
    console.error('[Subscriptions POST] Error:', error)
    if (error.message === 'Insufficient Stardust') {
      return NextResponse.json({ error: '스타더스트가 부족합니다.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// DELETE: 구독 해지
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { subscriptionId } = await request.json()

    if (!subscriptionId || typeof subscriptionId !== 'string') {
      return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 })
    }

    // 구독 조회 + 권한 확인
    const subscription = await prisma.thought_subscriptions.findUnique({
      where: { id: subscriptionId }
    })

    if (!subscription) {
      return NextResponse.json({ success: true }) // 멱등 설계
    }

    if (subscription.subscriber_id !== user.id) {
      return NextResponse.json({ error: '구독자만 해지할 수 있습니다.' }, { status: 403 })
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: '이미 해지된 구독입니다.' }, { status: 400 })
    }

    // Soft delete: status → cancelled
    await prisma.thought_subscriptions.update({
      where: { id: subscriptionId },
      data: {
        status: 'cancelled',
        cancelled_at: new Date(),
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Subscriptions DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
