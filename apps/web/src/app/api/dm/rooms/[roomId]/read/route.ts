import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function POST(_request: Request, props: { params: Promise<{ roomId: string }> }) {
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
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    await prisma.dmParticipant.update({
      where: { id: participant.id },
      data: {
        lastReadAt: new Date(),
        unreadCount: 0,
      },
    });

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DM Read Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
