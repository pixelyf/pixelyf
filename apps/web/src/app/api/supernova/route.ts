import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { SUPERNOVA_TIERS } from '@/shared/constants/supernova'
import prisma from '@/shared/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { receiverId, tierId } = await req.json()

    // 입력 검증
    if (!receiverId || typeof receiverId !== 'string') {
      return NextResponse.json({ error: 'receiverId is required' }, { status: 400 })
    }

    // [FIX BUG2] 자기 자신에게 후원 차단
    if (receiverId === authUser.id) {
      return NextResponse.json({ error: '자기 자신에게는 후원할 수 없습니다.' }, { status: 400 })
    }

    const tier = SUPERNOVA_TIERS.find(t => t.id === tierId)
    if (!tier) {
      return NextResponse.json({ error: 'Invalid Supernova Tier' }, { status: 400 })
    }

    // [FIX BUG3] 수신자 존재 여부 검증
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, supernova_tier: true, supernova_expires_at: true }
    })
    if (!receiver) {
      return NextResponse.json({ error: '존재하지 않는 사용자입니다.' }, { status: 404 })
    }

    // [FIX BUG4] 쿨다운: 동일 발신자 → 수신자 간 30초 이내 중복 후원 차단
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString()
    const recentTx = await prisma.stardust_transactions.findFirst({
      where: {
        user_id: authUser.id,
        category: 'SUPERNOVA',
        created_at: { gte: new Date(thirtySecondsAgo) },
        description: { contains: receiverId }
      }
    })
    if (recentTx) {
      return NextResponse.json({ error: '잠시 후 다시 시도해주세요. (30초 쿨다운)' }, { status: 429 })
    }

    // [PRISMA TRANSACTION] Atomic balance deduction and receiver update
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get sender's current balance
      const sender = await tx.user.findUnique({
        where: { id: authUser.id },
        select: { stardust_balance: true, display_name: true }
      })

      if (!sender || sender.stardust_balance < tier.cost) {
        throw new Error('Insufficient Stardust balance')
      }

      // 2. Deduct from sender
      const updatedSender = await tx.user.update({
        where: { id: authUser.id },
        data: {
          stardust_balance: { decrement: tier.cost }
        }
      })

      // [FIX BUG7] 음수 잔액 방어 (앱 레벨 이중 검증)
      if (updatedSender.stardust_balance < 0) {
        throw new Error('Insufficient Stardust balance')
      }

      // 3. [FIX BUG5] 수신자 티어 비교: 상위 티어만 적용
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + tier.durationHours)

      const tierRank: Record<string, number> = { BRONZE: 1, SILVER: 2, GOLD: 3 }
      const currentTierRank = tierRank[receiver.supernova_tier || ''] || 0
      const newTierRank = tierRank[tier.id] || 0
      const currentExpired = !receiver.supernova_expires_at ||
        new Date(receiver.supernova_expires_at) < new Date()

      // 현재 티어가 만료됐거나 새 티어가 더 높으면 갱신
      if (currentExpired || newTierRank >= currentTierRank) {
        await tx.user.update({
          where: { id: receiverId },
          data: {
            supernova_tier: tier.id,
            supernova_expires_at: currentExpired
              ? expiresAt
              : new Date(Math.max(
                  expiresAt.getTime(),
                  new Date(receiver.supernova_expires_at!).getTime()
                ))
          }
        })
      }

      // 4. Log transaction for sender (SPEND)
      await tx.stardust_transactions.create({
        data: {
          user_id: authUser.id,
          type: 'SPEND',
          amount: tier.cost,
          balance_after: updatedSender.stardust_balance,
          category: 'SUPERNOVA',
          description: `${tier.label} 후원 (대상: ${receiverId})`
        }
      })

      // [FIX BUG6] 5. Log transaction for receiver (RECEIVE)
      await tx.stardust_transactions.create({
        data: {
          user_id: receiverId,
          type: 'CHARGE',
          amount: tier.cost,
          balance_after: null, // 수신자 잔액은 직접 증가시키지 않음 (티어 효과만)
          category: 'SUPERNOVA',
          description: `${tier.label} 수신 (발신자: ${sender.display_name || authUser.id})`
        }
      })

      return {
        newBalance: updatedSender.stardust_balance,
        expiresAt
      }
    })

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
      expiresAt: result.expiresAt
    })

  } catch (error: any) {
    console.error('[Supernova API Error]:', error)
    return NextResponse.json({
      error: error.message || 'Internal Server Error'
    }, { status: error.message === 'Insufficient Stardust balance' ? 400 : 500 })
  }
}
