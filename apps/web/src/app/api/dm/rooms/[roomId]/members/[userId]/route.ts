import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'

// ══════════════════════════════════════════════════════════════
// DELETE /api/dm/rooms/[roomId]/members/[userId] — 멤버 강퇴 (KEEPER만)
// ══════════════════════════════════════════════════════════════

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string; userId: string }> }
) {
  try {
    const { roomId, userId: targetUserId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 방 확인
    const room = await prisma.dmRoom.findUnique({
      where: { id: roomId },
      select: { id: true, type: true },
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.type !== 'GROUP') {
      return NextResponse.json({ error: '1:1 DM에서는 멤버를 강퇴할 수 없습니다' }, { status: 400 })
    }

    // 자기 자신 강퇴 방지 (나가기는 /leave 사용)
    if (targetUserId === user.id) {
      return NextResponse.json({ error: '자신을 강퇴할 수 없습니다. 나가기를 사용하세요' }, { status: 400 })
    }

    // KEEPER 권한 확인
    const myParticipation = await prisma.dmParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    })

    if (!myParticipation || myParticipation.leftAt) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (myParticipation.role !== 'KEEPER') {
      return NextResponse.json({ error: '별자리 지킴이만 멤버를 내보낼 수 있습니다' }, { status: 403 })
    }

    // 대상 멤버 확인
    const targetParticipation = await prisma.dmParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    })

    if (!targetParticipation || targetParticipation.leftAt) {
      return NextResponse.json({ error: '해당 멤버를 찾을 수 없습니다' }, { status: 404 })
    }

    const messageToBroadcast = await prisma.$transaction(async (tx: any) => {
      // leftAt 기록 (softDelete)
      await tx.dmParticipant.update({
        where: { id: targetParticipation.id },
        data: { leftAt: new Date() },
      })

      // 시스템 메시지
      const [actor, target] = await Promise.all([
        tx.user.findUnique({ where: { id: user.id }, select: { display_name: true } }),
        tx.user.findUnique({ where: { id: targetUserId }, select: { display_name: true } }),
      ])

      const createdMsg = await tx.dmMessage.create({
        data: {
          roomId,
          senderId: user.id,
          content: `${actor?.display_name || '알 수 없음'}님이 ${target?.display_name || '알 수 없음'}님을 내보냈습니다`,
          type: 'SYSTEM',
        },
        include: {
          sender: {
            select: { id: true, display_name: true, avatar_image_url: true },
          },
        },
      })
      return createdMsg
    })

    // 실시간 브로드캐스트 전송
    try {
      if (messageToBroadcast) {
        const { createAdminClient } = await import('@/shared/lib/supabase/admin')
        const adminSupabase = createAdminClient()
        const broadcastChannel = adminSupabase.channel(`dm-room-${roomId}`)
        
        await broadcastChannel.send({
          type: 'broadcast',
          event: 'new-message',
          payload: {
            id: messageToBroadcast.id,
            roomId: messageToBroadcast.roomId,
            senderId: messageToBroadcast.senderId,
            content: messageToBroadcast.content,
            images: messageToBroadcast.images || [],
            type: messageToBroadcast.type,
            deletedAt: messageToBroadcast.deletedAt,
            createdAt: messageToBroadcast.createdAt.toISOString(),
            sender: messageToBroadcast.sender,
          },
        })
      }
    } catch (broadcastErr) {
      console.error('[Kick DM Member] Broadcast failed (non-critical):', broadcastErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/dm/rooms/:roomId/members/:userId]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
