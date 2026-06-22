import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// ══════════════════════════════════════════════════════════════
// DELETE /api/dm/rooms/[roomId]/leave — 채팅방 나가기
// Phase 3: 그룹 채팅 비즈니스 규칙 적용
// - 마지막 KEEPER가 나가면 가장 오래된 MEMBER를 자동 승격
// - 모든 멤버가 나가면 softDelete (데이터 보존, 목록에서 제외)
// ══════════════════════════════════════════════════════════════

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ roomId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await props.params;
    const roomId = params.roomId;

    const participant = await prisma.dmParticipant.findFirst({
      where: {
        roomId,
        userId: user.id,
        leftAt: null,
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Not participating in this room' }, { status: 404 })
    }

    // 방 정보 확인
    const room = await prisma.dmRoom.findUnique({
      where: { id: roomId },
      select: { type: true },
    })

    const messagesToBroadcast = await prisma.$transaction(async (tx: any) => {
      const msgs: any[] = []

      // 1. 참여자 나가기 처리
      await tx.dmParticipant.update({
        where: { id: participant.id },
        data: { leftAt: new Date() },
      })

      // 2. 그룹 채팅일 경우 추가 비즈니스 규칙
      if (room?.type === 'GROUP') {
        // 시스템 메시지 생성
        const actor = await tx.user.findUnique({
          where: { id: user.id },
          select: { display_name: true },
        })

        const leftMsg = await tx.dmMessage.create({
          data: {
            roomId,
            senderId: user.id,
            content: `${actor?.display_name || '알 수 없음'}님이 별자리를 떠났습니다`,
            type: 'SYSTEM',
          },
          include: {
            sender: {
              select: { id: true, display_name: true, avatar_image_url: true },
            },
          },
        })
        msgs.push(leftMsg)

        // 남은 활성 참여자 확인
        const remainingParticipants = await tx.dmParticipant.findMany({
          where: { roomId, leftAt: null },
          orderBy: { joinedAt: 'asc' },
        })

        if (remainingParticipants.length === 0) {
          // 모든 멤버가 나감 → 방은 유지 (softDelete 상태)
          return msgs
        }

        // 나간 사람이 KEEPER였고, 남은 KEEPER가 없는 경우
        if (participant.role === 'KEEPER') {
          const remainingKeepers = remainingParticipants.filter((p: any) => p.role === 'KEEPER')

          if (remainingKeepers.length === 0) {
            // 가장 오래된 MEMBER를 KEEPER로 자동 승격
            const oldestMember = remainingParticipants[0]

            await tx.dmParticipant.update({
              where: { id: oldestMember.id },
              data: { role: 'KEEPER' },
            })

            const promoted = await tx.user.findUnique({
              where: { id: oldestMember.userId },
              select: { display_name: true },
            })

            const promotedMsg = await tx.dmMessage.create({
              data: {
                roomId,
                senderId: oldestMember.userId,
                content: `${promoted?.display_name || '알 수 없음'}님이 새로운 별자리 지킴이가 되었습니다`,
                type: 'SYSTEM',
              },
              include: {
                sender: {
                  select: { id: true, display_name: true, avatar_image_url: true },
                },
              },
            })
            msgs.push(promotedMsg)
          }
        }
      }
      return msgs
    })

    // 실시간 브로드캐스트 전송
    try {
      if (messagesToBroadcast && messagesToBroadcast.length > 0) {
        const { createAdminClient } = await import('@/shared/lib/supabase/admin')
        const adminSupabase = createAdminClient()
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
              console.error(`[Leave DM Room] Realtime broadcast failed for message ${msg.id}:`, err)
            }
          })
        )
      }
    } catch (broadcastErr) {
      console.error('[Leave DM Room] Broadcast failed (non-critical):', broadcastErr)
    }

    return NextResponse.json({ success: true, message: 'Left room' })
  } catch (error) {
    console.error('[DELETE /api/dm/rooms/:roomId/leave]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
