import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'

// ══════════════════════════════════════════════════════════════
// PATCH /api/dm/rooms/[roomId]/members/[userId]/role — 역할 변경 (KEEPER만)
// ══════════════════════════════════════════════════════════════

export async function PATCH(
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

    if (!room || room.type !== 'GROUP') {
      return NextResponse.json({ error: '그룹 채팅방이 아닙니다' }, { status: 400 })
    }

    // KEEPER 권한 확인
    const myParticipation = await prisma.dmParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    })

    if (!myParticipation || myParticipation.leftAt || myParticipation.role !== 'KEEPER') {
      return NextResponse.json({ error: '별자리 지킴이만 역할을 변경할 수 있습니다' }, { status: 403 })
    }

    const body = await request.json()
    const { role } = body

    if (!role || !['KEEPER', 'MEMBER'].includes(role)) {
      return NextResponse.json({ error: '유효한 역할(KEEPER/MEMBER)을 지정하세요' }, { status: 400 })
    }

    // 대상 멤버 확인
    const targetParticipation = await prisma.dmParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    })

    if (!targetParticipation || targetParticipation.leftAt) {
      return NextResponse.json({ error: '해당 멤버를 찾을 수 없습니다' }, { status: 404 })
    }

    if (targetParticipation.role === role) {
      return NextResponse.json({ error: '이미 해당 역할입니다' }, { status: 400 })
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.dmParticipant.update({
        where: { id: targetParticipation.id },
        data: { role },
      })

      const [actor, target] = await Promise.all([
        tx.user.findUnique({ where: { id: user.id }, select: { display_name: true } }),
        tx.user.findUnique({ where: { id: targetUserId }, select: { display_name: true } }),
      ])

      const roleLabel = role === 'KEEPER' ? '별자리 지킴이' : '구성원'
      await tx.dmMessage.create({
        data: {
          roomId,
          senderId: user.id,
          content: `${actor?.display_name || '알 수 없음'}님이 ${target?.display_name || '알 수 없음'}님을 ${roleLabel}(으)로 변경했습니다`,
          type: 'SYSTEM',
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/dm/rooms/:roomId/members/:userId/role]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
