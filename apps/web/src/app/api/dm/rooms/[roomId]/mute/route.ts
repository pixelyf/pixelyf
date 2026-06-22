import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'

// ══════════════════════════════════════════════════════════════
// PATCH /api/dm/rooms/[roomId]/mute — 알림 음소거 설정 (본인)
// ══════════════════════════════════════════════════════════════

export async function PATCH(
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

    // 참여자 확인
    const myParticipation = await prisma.dmParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    })

    if (!myParticipation || myParticipation.leftAt) {
      return NextResponse.json({ error: '해당 채팅방의 참여자가 아닙니다' }, { status: 403 })
    }

    const body = await request.json()
    const { muteUntil } = body

    // muteUntil 유효성 검증
    let parsedMuteUntil: Date | null = null
    if (muteUntil !== null && muteUntil !== undefined) {
      parsedMuteUntil = new Date(muteUntil)
      if (isNaN(parsedMuteUntil.getTime())) {
        return NextResponse.json({ error: '유효한 날짜 형식이 아닙니다' }, { status: 400 })
      }
      if (parsedMuteUntil <= new Date()) {
        return NextResponse.json({ error: '음소거 만료일은 현재 시각 이후여야 합니다' }, { status: 400 })
      }
    }

    await prisma.dmParticipant.update({
      where: { id: myParticipation.id },
      data: { muteUntil: parsedMuteUntil },
    })

    return NextResponse.json({
      success: true,
      data: { muteUntil: parsedMuteUntil?.toISOString() || null },
    })
  } catch (error) {
    console.error('[PATCH /api/dm/rooms/:roomId/mute]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
