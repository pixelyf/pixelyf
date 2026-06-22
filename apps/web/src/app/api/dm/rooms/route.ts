import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { ensureAiSoulAndKey } from '@/shared/lib/ai/activation'

// ══════════════════════════════════════════════════════════════
// GET /api/dm/rooms — 내가 참여한 채팅방 목록 (1:1 DM + 그룹)
// POST /api/dm/rooms — 새 채팅방 생성 (1:1 DM 또는 그룹)
// ══════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 내가 참여한 채팅방 조회 (leftAt이 null인 방만)
    const participations = await prisma.dmParticipant.findMany({
      where: {
        userId: user.id,
        leftAt: null,
      },
      include: {
        room: {
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { id: true, content: true, createdAt: true, type: true },
            },
            participants: {
              where: { leftAt: null },
              include: {
                user: {
                  select: {
                    id: true,
                    display_name: true,
                    avatar_image_url: true,
                    current_aura: true,
                    coordinates: {
                      select: {
                        galaxyKey: true,
                        display_name: true,
                        avatar_image_url: true
                      }
                    }
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { room: { lastMessageAt: 'desc' } },
    });

    const rooms = participations.map((p: any) => {
      const room = p.room
      const isGroup = room.type === 'GROUP'

      // 1:1 DM: 상대방 한 명 추출 / GROUP: partner는 null
      let partner = isGroup
        ? null
        : room.participants.find(
            (pt: { userId: string }) => pt.userId !== user.id
          )?.user || null

      // 나와 내 아바타의 대화방(참여자가 나 1명)인 경우 partner를 나 자신으로 역매핑
      if (!isGroup && !partner) {
        const selfPt = room.participants.find((pt: { userId: string }) => pt.userId === user.id)
        if (selfPt) {
          partner = selfPt.user
        }
      }

      // 현재 활성 참여자 수
      const participantCount = room.participants.length

      return {
        id: room.id,
        type: room.type as 'DM' | 'GROUP' | 'CS',
        partner,
        name: room.name,
        avatarUrl: room.avatarUrl,
        participantCount,
        lastMessage: room.messages[0]
          ? {
              ...room.messages[0],
              content: room.lastMessagePreview || room.messages[0].content,
            }
          : null,
        unreadCount: p.unreadCount,
        updatedAt: room.lastMessageAt,
      }
    })

    return NextResponse.json({ success: true, data: { rooms } })
  } catch (error) {
    console.error('[GET /api/dm/rooms]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // ── 그룹 채팅 생성 ──
    if (body.type === 'GROUP') {
      return handleCreateGroup(user.id, body)
    }

    // ── 1:1 DM 생성 (기존 로직 유지) ──
    return handleCreateDm(user.id, body)
  } catch (error) {
    console.error('[POST /api/dm/rooms]', error)
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── 1:1 DM/CS 생성 ──
async function handleCreateDm(
  currentUserId: string,
  body: { targetUserId?: string; type?: 'DM' | 'CS' }
) {
  const { targetUserId, type = 'DM' } = body

  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 })
  }

  const isAvatarDm = targetUserId === currentUserId

  if (isAvatarDm) {
    // ⚠️ [On-Demand] 내 아바타 대화방 최초 개설 시 나 자신의 AI Soul 확보
    try {
      await ensureAiSoulAndKey(currentUserId)
    } catch (err) {
      console.error('[AiSoul On-Demand Create Failed] for Owner:', err)
    }

    // 기존 나와 내 아바타의 1:1 대화방(참여자가 오직 나 혼자이며, maxParticipants가 1인 DM방) 확인
    const existingRoom = await prisma.dmRoom.findFirst({
      where: {
        type: 'DM',
        maxParticipants: 1,
        participants: {
          some: { userId: currentUserId }
        }
      }
    })

    if (existingRoom) {
      return NextResponse.json({ success: true, data: { room: existingRoom } })
    }

    // 새 나와 내 아바타의 1:1 대화방 생성 (데이터베이스 제약조건을 위해 나 자신 1명만 참여자로 등록)
    const room = await prisma.dmRoom.create({
      data: {
        type: 'DM',
        maxParticipants: 1,
        participants: {
          create: [
            { userId: currentUserId }
          ]
        }
      }
    })

    return NextResponse.json({ success: true, data: { room } })
  }

  // ⚠️ [On-Demand] 일반 고객이 고객문의(CS) 방 최초 개설 시 대상 매장 점주의 AI Soul 확보
  if (type === 'CS') {
    try {
      await ensureAiSoulAndKey(targetUserId)
    } catch (err) {
      console.error('[AiSoul On-Demand Create Failed] for Store Owner:', err)
    }
  }

  // 기존 1:1 채팅방 확인 (나간 방이더라도 기존 방이 있으며 타입이 일치할 때 재사용하여 대화 내용 보존)
  const existingParticipation = await prisma.dmParticipant.findFirst({
    where: {
      userId: currentUserId,
      room: {
        type: type,
        ...(type === 'CS' ? { creatorId: currentUserId } : {}), // CS 타입일 때는 방 생성자(문의자) 필터 추가
        participants: {
          some: {
            userId: targetUserId,
          },
        },
      },
    },
    include: { room: true },
  })

  if (existingParticipation) {
    return NextResponse.json({ success: true, data: { room: existingParticipation.room } })
  }

  // 새 1:1 DM/CS 방 생성
  const room = await prisma.dmRoom.create({
    data: {
      type: type,
      maxParticipants: 2,
      ...(type === 'CS' ? { creatorId: currentUserId } : {}), // CS 타입일 때는 방 생성자(문의자) 지정
      participants: {
        create: [
          { userId: currentUserId },
          { userId: targetUserId },
        ],
      },
    },
  })

  // 상대방에게 새 방 개설 브로드캐스트 송출 (대화방 목록 실시간 갱신용)
  try {
    const { createAdminClient } = await import('@/shared/lib/supabase/admin')
    const adminSupabase = createAdminClient()
    const channel = adminSupabase.channel(`user-notifications-${targetUserId}`)
    await channel.send({
      type: 'broadcast',
      event: 'new-room',
      payload: { roomId: room.id },
    })
    // adminSupabase.removeChannel(channel) // [조기 소멸 차단] REST 전송 버퍼가 Supabase Realtime Gateway로 완전히 전송되기 전에 채널이 폭파되는 것을 방지합니다.
  } catch (broadcastErr) {
    console.error('[Create DM Room] Broadcast failed (non-critical):', broadcastErr)
  }

  return NextResponse.json({ success: true, data: { room } })
}

// ── 그룹(별자리) 채팅 생성 ──
async function handleCreateGroup(
  currentUserId: string,
  body: { targetUserIds?: string[]; name?: string; avatarUrl?: string }
) {
  const { targetUserIds, name, avatarUrl } = body

  if (!targetUserIds || !Array.isArray(targetUserIds)) {
    return NextResponse.json(
      { error: 'targetUserIds 배열이 필요합니다' },
      { status: 400 }
    )
  }

  // 본인을 제외한 고유 대상 유저
  const uniqueTargets = [...new Set(targetUserIds.filter(id => id !== currentUserId))]

  if (uniqueTargets.length < 2) {
    return NextResponse.json(
      { error: '그룹 채팅은 본인 포함 최소 3명이 필요합니다' },
      { status: 400 }
    )
  }

  const totalParticipants = uniqueTargets.length + 1 // +1 for creator
  if (totalParticipants > 10) {
    return NextResponse.json(
      { error: '그룹 채팅은 최대 10명까지 참여할 수 있습니다' },
      { status: 400 }
    )
  }

  // 대상 유저 존재 확인
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: uniqueTargets } },
    select: { id: true, display_name: true },
  })

  if (existingUsers.length !== uniqueTargets.length) {
    return NextResponse.json(
      { error: '존재하지 않는 유저가 포함되어 있습니다' },
      { status: 400 }
    )
  }

  // 기본 그룹명 생성 (설정 안 한 경우)
  const displayNames = existingUsers.map((u: any) => u.display_name)
  const defaultName =
    displayNames.length <= 3
      ? displayNames.join(', ')
      : `${displayNames.slice(0, 2).join(', ')} 외 ${displayNames.length - 2}명`

  // 그룹 방 생성 (트랜잭션)
  const room = await prisma.$transaction(async (tx: any) => {
    const newRoom = await tx.dmRoom.create({
      data: {
        type: 'GROUP',
        name: name || defaultName,
        avatarUrl: avatarUrl || null,
        creatorId: currentUserId,
        maxParticipants: 10,
        participants: {
          create: [
            // 생성자는 KEEPER
            { userId: currentUserId, role: 'KEEPER' },
            // 나머지는 MEMBER
            ...uniqueTargets.map(id => ({ userId: id, role: 'MEMBER' as const })),
          ],
        },
      },
    })

    // 시스템 메시지: 그룹 생성 알림
    const creator = await tx.user.findUnique({
      where: { id: currentUserId },
      select: { display_name: true },
    })

    await tx.dmMessage.create({
      data: {
        roomId: newRoom.id,
        senderId: currentUserId,
        content: `${creator?.display_name || '알 수 없음'}님이 별자리를 만들었습니다`,
        type: 'SYSTEM',
      },
    })

    return newRoom
  })

  // 참여자들에게 실시간 방 생성 이벤트 브로드캐스트 전송 (대화방 목록 실시간 갱신용)
  try {
    const { createAdminClient } = await import('@/shared/lib/supabase/admin')
    const adminSupabase = createAdminClient()
    
    await Promise.all(
      uniqueTargets.map(async (targetId) => {
        try {
          const channel = adminSupabase.channel(`user-notifications-${targetId}`)
          await channel.send({
            type: 'broadcast',
            event: 'new-room',
            payload: { roomId: room.id },
          })
        } catch (err) {
          console.error(`[Create GROUP Room] Broadcast failed to user ${targetId}:`, err)
        }
      })
    )
  } catch (broadcastErr) {
    console.error('[Create GROUP Room] Broadcast failed (non-critical):', broadcastErr)
  }

  return NextResponse.json({ success: true, data: { room } })
}
