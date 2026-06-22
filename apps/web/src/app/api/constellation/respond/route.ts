import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { sendNotification } from '@/shared/services/notificationService'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/constellation/respond
 * 받은 별자리 연결 요청 승인 또는 거절
 *
 * - 오직 수신자(user_b_id)만 호출 가능
 * - action: 'accept' → status = 'accepted' (연결 완료, 요청자에게 실시간 알림)
 * - action: 'reject' → status = 'rejected', rejected_at = now()
 *   ※ 조용한 거절 패턴: 요청자에게 알림 없음, 30일 쿨다운 부여
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { bondId, action } = await request.json()

    if (!bondId || typeof bondId !== 'string') {
      return NextResponse.json({ error: 'bondId is required' }, { status: 400 })
    }

    if (action !== 'accept' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be "accept" or "reject"' }, { status: 400 })
    }

    // bond 조회 및 권한 검증
    const bond = await prisma.constellation_bonds.findUnique({
      where: { id: bondId },
      select: {
        id: true,
        user_a_id: true,
        user_b_id: true,
        status: true,
        users_constellation_bonds_user_a_idTousers: {
          select: { display_name: true }
        },
      }
    })

    if (!bond) {
      return NextResponse.json({ error: '존재하지 않는 연결 요청입니다.' }, { status: 404 })
    }

    // 오직 수신자(user_b)만 응답 가능
    if (bond.user_b_id !== user.id) {
      return NextResponse.json({ error: '이 요청에 응답할 권한이 없습니다.' }, { status: 403 })
    }

    // pending 상태인 요청에만 응답 가능
    if (bond.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 409 })
    }

    if (action === 'accept') {
      // ── 승인: status → accepted ──────────────────────────────
      await prisma.constellation_bonds.update({
        where: { id: bondId },
        data: { status: 'accepted' }
      })

      // 요청자에게 수락 실시간 알림
      const { data: receiverData } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', user.id)
        .single()

      const channelName = `user-constellation-${bond.user_a_id}`
      const channel = supabase.channel(channelName)
      await channel.send({
        type: 'broadcast',
        event: 'constellation-accepted',
        payload: {
          acceptor_id: user.id,
          acceptor_name: receiverData?.display_name || '누군가',
        }
      })
      await supabase.removeChannel(channel)

      // [알림 DB+Push] 별자리 연결 수락 알림 (요청자에게) — 알림 실패가 수락 실패로 이어지면 안 됨
      try {
        await sendNotification({
          userId: bond.user_a_id,
          type: 'BOND',
          title: `${receiverData?.display_name || '누군가'}님이 픽셀리어 연결을 수락했습니다`,
          body: '이제 서로의 픽셀리어가 연결되었습니다.',
          actorId: user.id,
        })
      } catch (notifError) {
        console.error('[Constellation Respond] Notification failed (non-critical):', notifError)
      }

      return NextResponse.json({ success: true, status: 'accepted' })

    } else {
      // ── 거절: status → rejected, rejected_at = now() ─────────
      // [조용한 거절 패턴] 요청자에게 알림 없음
      // row를 삭제하지 않고 보존 → 30일 쿨다운 계산 기준
      await prisma.constellation_bonds.update({
        where: { id: bondId },
        data: {
          status: 'rejected',
          rejected_at: new Date(),
        }
      })

      // 거절 알림 없음 — 의도적 설계 (조용한 거절, 업계 표준 패턴)
      return NextResponse.json({ success: true, status: 'rejected' })
    }
  } catch (error) {
    console.error('[Constellation RESPOND] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
