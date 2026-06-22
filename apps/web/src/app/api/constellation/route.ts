import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { sendNotification } from '@/shared/services/notificationService'

export const dynamic = 'force-dynamic'

// ──────────────────────────────────────────────────────────────
// GET: 내 별자리 연결 목록 (accepted + pending 분리 반환)
// ──────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // [GALAXY FIX] galaxy_key 필터 지원
    const { searchParams } = new URL(req.url)
    const galaxyKey = searchParams.get('galaxy') || null

    // 양방향 조회: user_a 또는 user_b가 나인 경우 (rejected 제외 — 요청자에게 미노출)
    const allBonds = await prisma.constellation_bonds.findMany({
      where: {
        OR: [
          { user_a_id: user.id },
          { user_b_id: user.id },
        ],
        NOT: { status: 'rejected' }, // rejected는 UI에서 완전히 숨김 (조용한 거절)
        ...(galaxyKey ? { galaxy_key: galaxyKey } : {}), // [GALAXY] 은하별 필터
      },
      select: {
        id: true,
        user_a_id: true,
        user_b_id: true,
        bond_type: true,
        bond_color: true,
        status: true,
        created_at: true,
        galaxy_key: true,
        users_constellation_bonds_user_a_idTousers: {
          select: { display_name: true, pixel_id: true }
        },
        users_constellation_bonds_user_b_idTousers: {
          select: { display_name: true, pixel_id: true }
        },
      },
      orderBy: { created_at: 'desc' }
    })

    // 상태별 분류
    const bonds: any[] = []           // accepted — 연결 완료
    const pendingReceived: any[] = [] // pending & user_b = 나 (받은 요청)
    const pendingSent: any[] = []     // pending & user_a = 나 (보낸 요청)

    for (const b of allBonds) {
      const isRequester = b.user_a_id === user.id
      const partner = isRequester
        ? b.users_constellation_bonds_user_b_idTousers
        : b.users_constellation_bonds_user_a_idTousers
      const partnerId = isRequester ? b.user_b_id : b.user_a_id

      const entry = {
        id: b.id,
        partnerId,
        displayName: partner.display_name || '알 수 없는 별',
        pixelId: partner.pixel_id || null,
        bondType: b.bond_type,
        bondColor: b.bond_color,
        galaxyKey: b.galaxy_key,
        status: b.status,
        createdAt: b.created_at,
      }

      if (b.status === 'accepted') {
        bonds.push(entry)
      } else if (b.status === 'pending') {
        if (isRequester) {
          pendingSent.push(entry)
        } else {
          pendingReceived.push(entry)
        }
      }
    }

    return NextResponse.json({ bonds, pendingReceived, pendingSent })
  } catch (error) {
    console.error('[Constellation GET] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────
// POST: 별자리 연결 요청 (pending 상태로 생성)
// ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, galaxyKey } = await request.json()

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // [GALAXY FIX] 은하 키 필수 검증
    if (!galaxyKey || typeof galaxyKey !== 'string') {
      return NextResponse.json({ error: 'galaxyKey is required — 별자리 연결은 은하 내에서만 가능합니다.' }, { status: 400 })
    }

    if (userId === user.id) {
      return NextResponse.json({ error: '자기 자신과는 연결할 수 없습니다.' }, { status: 400 })
    }

    // 대상 존재 확인
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, display_name: true, max_constellation_bonds: true }
    })
    if (!target) {
      return NextResponse.json({ error: '존재하지 않는 사용자입니다.' }, { status: 404 })
    }

    // 차단 관계 확인 (양방향)
    const blockExists = await prisma.user_blocks.findFirst({
      where: {
        OR: [
          { blocker_id: user.id, blocked_id: userId },
          { blocker_id: userId, blocked_id: user.id },
        ]
      }
    })
    if (blockExists) {
      return NextResponse.json({ error: '차단 관계에서는 별자리 연결을 할 수 없습니다.' }, { status: 403 })
    }

    // [쿨다운 체크] 거절된 요청 30일 이내 재요청 방지 (조용한 거절 — 사유 미노출)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const rejectedBond = await prisma.constellation_bonds.findFirst({
      where: {
        OR: [
          { user_a_id: user.id, user_b_id: userId },
          { user_a_id: userId, user_b_id: user.id },
        ],
        status: 'rejected',
        rejected_at: { gte: thirtyDaysAgo },
      }
    })
    if (rejectedBond) {
      // 거절 사실을 직접 노출하지 않음 — 업계 표준 패턴 (조용한 거절)
      return NextResponse.json(
        { error: '잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    // 기존 연결 확인 (양방향 — accepted or pending, 같은 은하)
    const existing = await prisma.constellation_bonds.findFirst({
      where: {
        OR: [
          { user_a_id: user.id, user_b_id: userId },
          { user_a_id: userId, user_b_id: user.id },
        ],
        status: { in: ['accepted', 'pending'] },
        galaxy_key: galaxyKey,  // [GALAXY FIX] 같은 은하 내 중복 체크
      }
    })
    if (existing) {
      const msg = existing.status === 'pending'
        ? '이미 연결 요청 중입니다.'
        : '이미 별자리가 연결되어 있습니다.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    // [CONSTELLATION LIMIT] 연결 완료(accepted) 기준으로만 한도 체크
    const [requesterData, requesterAcceptedCount, receiverAcceptedCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { max_constellation_bonds: true }
      }),
      prisma.constellation_bonds.count({
        where: {
          OR: [{ user_a_id: user.id }, { user_b_id: user.id }],
          status: 'accepted',
        }
      }),
      prisma.constellation_bonds.count({
        where: {
          OR: [{ user_a_id: userId }, { user_b_id: userId }],
          status: 'accepted',
        }
      }),
    ])

    const myMax = requesterData?.max_constellation_bonds ?? 20
    const theirMax = target.max_constellation_bonds ?? 20

    if (requesterAcceptedCount >= myMax) {
      return NextResponse.json(
        { error: `별자리 연결이 모두 채워졌습니다 (${myMax}명)` },
        { status: 403 }
      )
    }
    if (receiverAcceptedCount >= theirMax) {
      return NextResponse.json(
        { error: `${target.display_name}님의 별자리 연결이 모두 채워졌습니다` },
        { status: 403 }
      )
    }

    // 거절된 기존 row가 있으면 재활용 (upsert 형태), 없으면 신규 생성
    const rejectedExisting = await prisma.constellation_bonds.findFirst({
      where: {
        user_a_id: user.id,
        user_b_id: userId,
        status: 'rejected',
      }
    })

    if (rejectedExisting) {
      // 30일 이후 재요청 허용 — 기존 row를 pending으로 재활성화
      await prisma.constellation_bonds.update({
        where: { id: rejectedExisting.id },
        data: { status: 'pending', rejected_at: null, created_at: new Date(), galaxy_key: galaxyKey }
      })
    } else {
      await prisma.constellation_bonds.create({
        data: {
          user_a_id: user.id,
          user_b_id: userId,
          bond_type: 'constellation',
          status: 'pending',
          galaxy_key: galaxyKey,  // [GALAXY FIX] 은하 키 저장
        }
      })
    }

    // 수신자에게 실시간 알림 (Supabase Realtime broadcast)
    const { data: senderData } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single()

    const channelName = `user-constellation-${userId}`
    const channel = supabase.channel(channelName)
    await channel.send({
      type: 'broadcast',
      event: 'constellation-request',
      payload: {
        sender_id: user.id,
        sender_name: senderData?.display_name || '누군가',
      }
    })
    await supabase.removeChannel(channel)

    // [알림 DB+Push] 별자리 연결 요청 알림 — 알림 실패가 연결 요청 실패로 이어지면 안 됨
    try {
      await sendNotification({
        userId,
        type: 'BOND',
        title: `${senderData?.display_name || '누군가'}님의 픽셀리어 연결 요청`,
        body: '설정 → 소셜 연결에서 확인하고 수락할 수 있습니다.',
        actorId: user.id,
      })
    } catch (notifError) {
      console.error('[Constellation] Notification failed (non-critical):', notifError)
    }

    return NextResponse.json({ success: true, status: 'pending' })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: '이미 연결 요청 중입니다.' }, { status: 409 })
    }
    console.error('[Constellation POST] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────
// DELETE: 연결 해제(accepted) or 요청 취소(pending — 요청자만)
// ──────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { bondId } = await request.json()

    if (!bondId || typeof bondId !== 'string') {
      return NextResponse.json({ error: 'bondId is required' }, { status: 400 })
    }

    const bond = await prisma.constellation_bonds.findUnique({
      where: { id: bondId }
    })

    if (!bond) {
      return NextResponse.json({ success: true }) // 멱등 설계
    }

    // 권한 체크
    if (bond.user_a_id !== user.id && bond.user_b_id !== user.id) {
      return NextResponse.json({ error: '이 연결을 해제할 권한이 없습니다.' }, { status: 403 })
    }

    // pending 상태 취소는 요청자(user_a)만 가능
    if (bond.status === 'pending' && bond.user_a_id !== user.id) {
      return NextResponse.json({ error: '요청 취소는 요청자만 가능합니다.' }, { status: 403 })
    }

    await prisma.constellation_bonds.delete({
      where: { id: bondId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Constellation DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
