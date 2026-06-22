import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from "@/shared/lib/prisma";
import { PING_TYPES } from '@/shared/constants/pings'
import { CRYSTAL_PING_TIERS } from '@/shared/constants/crystalPings'
import { sendNotification } from '@/shared/services/notificationService'

type PingInsertData = {
  sender_id: string
  receiver_id: string
  ping_type: string
  is_crystal: boolean
  moment_id: string | null
  galaxy_key: string | null
}

async function insertPingWithLock(data: PingInsertData) {
  try {
    await prisma.$transaction(async (tx) => {
      if (data.moment_id) {
        await tx.$queryRaw`SELECT id FROM moments WHERE id = ${data.moment_id}::uuid FOR UPDATE`
        const existingPing = await tx.ping.findFirst({
          where: { sender_id: data.sender_id, moment_id: data.moment_id },
          select: { id: true },
        })
        if (existingPing) {
          throw new Error('DUPLICATE_MOMENT_PING')
        }
      }

      await tx.ping.create({ data })

      if (data.moment_id) {
        await tx.moment.update({
          where: { id: data.moment_id },
          data: { ping_count: { increment: 1 } },
        })
      }
    })

    return null
  } catch (error) {
    return error
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // [GALAXY FIX] galaxyKey(신규) + galaxyDomain(레거시 하위호환) 동시 수신
    const { receiverId, pingType, isCrystal, crystalTierId, momentId, galaxyKey: _gk, galaxyDomain } = await request.json()
    const galaxyKey = _gk || galaxyDomain || null

    // Bug fix: Validate inputs
    if (!receiverId || typeof receiverId !== 'string') {
      return NextResponse.json({ error: 'receiverId is required' }, { status: 400 })
    }

    // Bug fix: Block self-pings
    if (receiverId === user.id) {
      return NextResponse.json({ error: 'Cannot ping yourself' }, { status: 400 })
    }

    const validPingTypes = PING_TYPES.map(p => p.id)
    if (!pingType || !validPingTypes.includes(pingType)) {
      return NextResponse.json({ error: 'Invalid ping type' }, { status: 400 })
    }

    // [Touch/Ping 2원 체계] momentId 선택적 검증
    let validMomentId: string | null = null
    if (momentId && typeof momentId === 'string') {
      const moment = await prisma.moment.findFirst({
        where: { id: momentId, is_deleted: false },
        select: { id: true, user_id: true, target_pixel_id: true },
      })

      if (moment) {
        const expectedReceiverId = moment.target_pixel_id || moment.user_id
        if (receiverId !== expectedReceiverId) {
          return NextResponse.json({ error: 'receiverId does not match moment owner' }, { status: 400 })
        }
        validMomentId = moment.id
      }
    }

    // 슈퍼핑(크리스탈) 검증
    let crystalTier = null
    if (isCrystal) {
      crystalTier = CRYSTAL_PING_TIERS.find(t => t.id === crystalTierId)
      if (!crystalTier) {
        return NextResponse.json({ error: 'Invalid crystal ping tier' }, { status: 400 })
      }
    }

    // [요구사항] 핑은 쿨타임이 없는 피드 좋아요와 같은 기능이어야 하므로, 사용자 단위 12시간 쿨다운 로직을 주석 처리하여 비활성화합니다.
    // 단, 동일 피드에 대한 중복 핑은 아래의 [1인 1핑 원칙]을 통해 차단됩니다.
    /*
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const { data: recentPings } = await supabase
      .from('pings')
      .select('id')
      .eq('sender_id', user.id)
      .eq('receiver_id', receiverId)
      .gte('created_at', twelveHoursAgo)
      .limit(1)

    if (recentPings && recentPings.length > 0) {
      return NextResponse.json({ error: '잠시 후 다시 보내주세요. (12시간 쿨다운)' }, { status: 429 })
    }
    */


    // [1인 1핑 원칙] 이 모먼트에 이미 핑을 보냈는지 확인
    if (validMomentId) {
      const existingPing = await prisma.ping.findFirst({
        where: { sender_id: user.id, moment_id: validMomentId },
        select: { id: true },
      })

      if (existingPing) {
        return NextResponse.json({ error: 'Already pinged this moment' }, { status: 409 })
      }
    }

    // 슈퍼핑: 스타더스트 차감 (Prisma 트랜잭션)
    let newBalance: number | null = null
    if (crystalTier) {
      const result = await prisma.$transaction(async (tx) => {
        const sender = await tx.user.findUnique({
          where: { id: user.id },
          select: { stardust_balance: true }
        })

        if (!sender || sender.stardust_balance < crystalTier!.cost) {
          throw new Error('Insufficient Stardust')
        }

        const updated = await tx.user.update({
          where: { id: user.id },
          data: { stardust_balance: { decrement: crystalTier!.cost } }
        })

        if (updated.stardust_balance < 0) {
          throw new Error('Insufficient Stardust')
        }

        // 거래 기록
        await tx.stardust_transactions.create({
          data: {
            user_id: user.id,
            type: 'SPEND',
            amount: crystalTier!.cost,
            balance_after: updated.stardust_balance,
            category: 'CRYSTAL_PING',
            description: `크리스탈 핑 ${crystalTier!.label} (대상: ${receiverId})`
          }
        })

        return updated.stardust_balance
      })
      newBalance = result
    }

    // 1. Save to pings table
    const pingError = await insertPingWithLock({
      sender_id: user.id,
      receiver_id: receiverId,
      ping_type: pingType,
      is_crystal: !!isCrystal,
      moment_id: validMomentId,
      galaxy_key: galaxyKey || null,  // [GALAXY FIX] 은하 출처 저장
    })

    if (pingError) {
      const isDuplicateMomentPing = pingError instanceof Error && pingError.message === 'DUPLICATE_MOMENT_PING'
      // 크리스탈 핑이었고 이미 차감된 경우: 보상 트랜잭션으로 잔액 복원
      if (crystalTier && newBalance !== null) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: { stardust_balance: { increment: crystalTier!.cost } }
            })
            await tx.stardust_transactions.create({
              data: {
                user_id: user.id,
                type: 'CHARGE',
                amount: crystalTier!.cost,
                balance_after: newBalance! + crystalTier!.cost,
                category: 'CRYSTAL_PING_REFUND',
                description: `크리스탈 핑 전송 실패 환불`
              }
            })
          })
        } catch (refundError) {
          console.error('[Ping] CRITICAL: Refund failed after ping insert error:', refundError)
        }
      }
      if (isDuplicateMomentPing) {
        return NextResponse.json({ error: 'Already pinged this moment' }, { status: 409 })
      }
      throw pingError
    }

    // 2. [EVOLUTION] 진화 점수 즉시 증분 (크리스탈 부스트 고려)
    const glowAmount = crystalTier ? crystalTier.glowBoost : 2
    const rpcCalls: PromiseLike<any>[] = [
      // [EVOLUTION] 전역 레거시 RPC (하위 호환)
      supabase.rpc('increment_activity_score', { user_id_param: receiverId, amount: glowAmount }),
      supabase.rpc('increment_activity_score', { user_id_param: user.id, amount: 2 }),
    ]
    // [MULTIVERSE] 은하별 독립 RPC
    if (galaxyKey) {
      rpcCalls.push(
        supabase.rpc('increment_galaxy_activity_score', {
          user_id_param: receiverId, galaxy_key_param: galaxyKey, amount: glowAmount,
        }),
        supabase.rpc('increment_galaxy_activity_score', {
          user_id_param: user.id, galaxy_key_param: galaxyKey, amount: 2,
        }),
      )
    }
    await Promise.all(rpcCalls)


    // 3. [NEW] 발신자 이름 조회 (Toast 알림에 표시)
    const { data: senderData } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single()

    // 4. [NEW] Supabase Realtime broadcast → PingListener가 수신하여 Toast 표시
    const channelName = `user-ping-${receiverId}`
    const pingChannel = supabase.channel(channelName)
    await pingChannel.send({
      type: 'broadcast',
      event: 'new-ping',
      payload: {
        sender_name: senderData?.display_name || '누군가',
        ping_type: pingType,
        is_crystal: !!isCrystal,
        crystal_tier_id: crystalTier?.id || null,
      }
    })
    await supabase.removeChannel(pingChannel)

    // [알림 DB+Push] 핑 수신 알림 — 알림 실패가 핑 실패로 이어지면 안 됨
    try {
      const pingDef = PING_TYPES.find(p => p.id === pingType)
      await sendNotification({
        userId: receiverId,
        type: 'PING',
        title: `${senderData?.display_name || '누군가'}님의 핑`,
        body: `${pingDef?.label || '핑'}이 도착했습니다.`,
        link: `/?pixel=${receiverId}`,
        actorId: user.id,
      })
    } catch (notifError) {
      console.error('[Pings] Notification failed (non-critical):', notifError)
    }

    // 5. AI Interaction Trigger Check
    // 6차 정밀 감사: 수신자가 AI 캐릭터인지 pixel_id를 통해 판별
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { pixel_id: true }
    });

    if (receiver?.pixel_id) {
      const characterCode = receiver.pixel_id.toUpperCase();
      // MBTI 기반 AI 수호자 코드 리스트 (personas.ts와 동격)
      const aiCharacters = [
        'INTJ', 'INTP', 'ENTJ', 'ENTP', 
        'INFJ', 'INFP', 'ENFJ', 'ENFP', 
        'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 
        'ISTP', 'ISFP', 'ESTP', 'ESFP'
      ];
      
      if (aiCharacters.includes(characterCode)) {
        // AI 상호작용 레코드 생성 (비동기 처리 대상)
        const interaction = await prisma.aiInteraction.create({
          data: {
            user_id: user.id,
            character_code: characterCode,
            trigger_type: "PING",
            action_type: "REACTION", // 핑에 대한 반응
            status: "pending"
          }
        });

        // Inngest 이벤트 발송 (Phase 2에서 구축한 비동기 아키텍처 연동)
        const { inngest } = await import("@/lib/inngest");
        await inngest.send({
          name: "ai/interaction.triggered",
          data: {
            userId: user.id,
            characterCode: characterCode,
            triggerType: "PING",
            interactionId: interaction.id
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      ...(newBalance !== null && { newBalance })
    })
  } catch (error: any) {
    console.error('Ping Error:', error)
    if (error.message === 'Insufficient Stardust') {
      return NextResponse.json({ error: '스타더스트가 부족합니다.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    // [GALAXY FIX] galaxyKey(신규) + galaxyDomain(레거시 하위호환)
    const { receiverId, momentId, galaxyKey: _gkD, galaxyDomain: _gdD } = await request.json()
    const galaxyKey = _gkD || _gdD || null
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!momentId || !receiverId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // 1. 기존 핑 내역 삭제 (Prisma를 사용하여 RLS 우회 삭제 보장)
    const result = await prisma.ping.deleteMany({
      where: {
        sender_id: user.id,
        moment_id: momentId
      }
    });

    if (result.count === 0) {
      return NextResponse.json({ success: true, message: 'No ping found to delete' })
    }

    // [PRODUCTION] moments.ping_count 원자적 감소
    await prisma.moment.update({
      where: { id: momentId },
      data: { ping_count: { decrement: result.count } },
    })

    // 2. 진화 점수 롤백 (핑 전송분 차감)
    // 핑 보낼 때 receiver +2, sender +2 증가했었으므로, 각각 -2 차감
    const rollbackAmount = -2
    const rpcCalls: PromiseLike<any>[] = [
      supabase.rpc('increment_activity_score', { user_id_param: receiverId, amount: rollbackAmount }),
      supabase.rpc('increment_activity_score', { user_id_param: user.id, amount: rollbackAmount }),
    ]
    if (galaxyKey) {
      rpcCalls.push(supabase.rpc('increment_galaxy_activity_score', { user_id_param: receiverId, galaxy_key_param: galaxyKey, amount: rollbackAmount }))
      rpcCalls.push(supabase.rpc('increment_galaxy_activity_score', { user_id_param: user.id, galaxy_key_param: galaxyKey, amount: rollbackAmount }))
    }

    // 백그라운드 비동기 처리
    Promise.all(rpcCalls).catch(e => console.error('[Ping Rollback Error]', e))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete Ping Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
