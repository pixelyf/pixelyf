import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'

// ══════════════════════════════════════════════════════════════
// POST /api/dm/rooms/[roomId]/invite — 멤버 초대 (KEEPER만)
// ══════════════════════════════════════════════════════════════

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 방 확인
    const room = await prisma.dmRoom.findUnique({
      where: { id: roomId },
      select: { id: true, type: true, maxParticipants: true },
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.type !== 'GROUP') {
      return NextResponse.json({ error: '1:1 DM에는 멤버를 초대할 수 없습니다' }, { status: 400 })
    }

    // KEEPER 권한 확인
    const myParticipation = await prisma.dmParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    })

    if (!myParticipation || myParticipation.leftAt) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (myParticipation.role !== 'KEEPER') {
      return NextResponse.json({ error: '별자리 지킴이만 멤버를 초대할 수 있습니다' }, { status: 403 })
    }

    const body = await request.json()
    const { userIds } = body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: '초대할 유저 ID가 필요합니다' }, { status: 400 })
    }

    // 현재 활성 참여자 수 확인
    const activeCount = await prisma.dmParticipant.count({
      where: { roomId, leftAt: null },
    })

    const limit = 10
    if (activeCount + userIds.length > limit) {
      return NextResponse.json(
        { error: `최대 ${limit}명까지 참여할 수 있습니다 (현재 ${activeCount}명)` },
        { status: 400 }
      )
    }

    // 대상 유저 존재 확인
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, display_name: true },
    })

    if (existingUsers.length !== userIds.length) {
      return NextResponse.json({ error: '존재하지 않는 유저가 포함되어 있습니다' }, { status: 400 })
    }

    const messagesToBroadcast = await prisma.$transaction(async (tx: any) => {
      const msgs: any[] = []
      const inviterName = (await tx.user.findUnique({
        where: { id: user.id },
        select: { display_name: true },
      }))?.display_name || '알 수 없음'

      for (const targetUser of existingUsers) {
        // 이미 참여 중인 유저는 건너뛰기
        const existing = await tx.dmParticipant.findUnique({
          where: { roomId_userId: { roomId, userId: targetUser.id } },
        })

        if (existing && !existing.leftAt) {
          continue // 이미 활성 참여 중
        }

        if (existing && existing.leftAt) {
          // 이전에 나갔던 유저 → 재참여 처리
          await tx.dmParticipant.update({
            where: { id: existing.id },
            data: { leftAt: null, role: 'MEMBER', unreadCount: 0 },
          })
        } else {
          // 신규 참여자
          await tx.dmParticipant.create({
            data: { roomId, userId: targetUser.id, role: 'MEMBER' },
          })
        }

        // 시스템 메시지
        const msg = await tx.dmMessage.create({
          data: {
            roomId,
            senderId: user.id,
            content: `${inviterName}님이 ${targetUser.display_name}님을 초대했습니다`,
            type: 'SYSTEM',
          },
          include: {
            sender: {
              select: { id: true, display_name: true, avatar_image_url: true },
            },
          },
        })
        msgs.push(msg)
      }
      return msgs
    })

    // 실시간 브로드캐스트 송출 (기존 방 채널 및 초대된 유저 채널)
    try {
      const { createAdminClient } = await import('@/shared/lib/supabase/admin')
      const adminSupabase = createAdminClient()

      // 1. 방에 시스템 메시지 실시간 전송
      if (messagesToBroadcast && messagesToBroadcast.length > 0) {
        const broadcastChannel = adminSupabase.channel(`dm-room-${roomId}`)
        await Promise.all(
          messagesToBroadcast.map(async (msg) => {
            try {
              await broadcastChannel.send({
                type: 'broadcast',
                event: 'new-message',
                payload: {
                  id: msg.id,
                  roomId: msg.roomId,
                  senderId: msg.senderId,
                  content: msg.content,
                  images: msg.images || [],
                  type: msg.type,
                  deletedAt: msg.deletedAt,
                  createdAt: msg.createdAt.toISOString(),
                  sender: msg.sender,
                },
              })
            } catch (err) {
              console.error(`[Invite DM Room] Realtime broadcast failed for message ${msg.id}:`, err)
            }
          })
        )
      }

      // 2. 초대된 유저들에게 대화방 목록 갱신 알림 전송
      await Promise.all(
        userIds.map(async (targetId: string) => {
          try {
            const channel = adminSupabase.channel(`user-notifications-${targetId}`)
            await channel.send({
              type: 'broadcast',
              event: 'new-room',
              payload: { roomId },
            })
          } catch (err) {
            console.error(`[Invite DM Room] new-room broadcast failed to user ${targetId}:`, err)
          }
        })
      )
    } catch (broadcastErr) {
      console.error('[Invite DM Room] Broadcast failed (non-critical):', broadcastErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/dm/rooms/:roomId/invite]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
