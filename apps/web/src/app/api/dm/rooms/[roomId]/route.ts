import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'

// ══════════════════════════════════════════════════════════════
// GET /api/dm/rooms/[roomId] — 방 상세 정보
// PATCH /api/dm/rooms/[roomId] — 그룹 설정 변경 (KEEPER만)
// ══════════════════════════════════════════════════════════════

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const room = await prisma.dmRoom.findUnique({
      where: { id: roomId },
      include: {
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
              }
            }
          },
          orderBy: { joinedAt: 'asc' },
        }
      }
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const isParticipant = room.participants.some((p: any) => p.userId === user.id)
    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ data: { room } })
  } catch (error) {
    console.error('[GET /api/dm/rooms/:roomId]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 방 존재 및 타입 확인
    const room = await prisma.dmRoom.findUnique({
      where: { id: roomId },
      select: { id: true, type: true },
    })

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.type !== 'GROUP') {
      return NextResponse.json({ error: '1:1 DM은 설정을 변경할 수 없습니다' }, { status: 400 })
    }

    // KEEPER 권한 확인
    const myParticipation = await prisma.dmParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    })

    if (!myParticipation || myParticipation.leftAt) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (myParticipation.role !== 'KEEPER') {
      return NextResponse.json({ error: '별자리 지킴이만 설정을 변경할 수 있습니다' }, { status: 403 })
    }

    const body = await request.json()
    const { name, avatarUrl } = body

    // 변경할 필드만 업데이트
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 50) {
        return NextResponse.json({ error: '별자리 이름은 1~50자여야 합니다' }, { status: 400 })
      }
      updateData.name = name.trim()
    }
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '변경할 항목이 없습니다' }, { status: 400 })
    }

    const updatedRoom = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.dmRoom.update({
        where: { id: roomId },
        data: updateData,
      })

      // 시스템 메시지 생성
      const actor = await tx.user.findUnique({
        where: { id: user.id },
        select: { display_name: true },
      })
      const actorName = actor?.display_name || '알 수 없음'

      if (name !== undefined) {
        await tx.dmMessage.create({
          data: {
            roomId,
            senderId: user.id,
            content: `${actorName}님이 별자리 이름을 '${name.trim()}'(으)로 변경했습니다`,
            type: 'SYSTEM',
          },
        })
      }

      return updated
    })

    return NextResponse.json({ success: true, data: { room: updatedRoom } })
  } catch (error) {
    console.error('[PATCH /api/dm/rooms/:roomId]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
