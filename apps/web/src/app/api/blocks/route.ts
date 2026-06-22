import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export const dynamic = 'force-dynamic'

// GET: 내가 차단한 목록 조회
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const blocks = await prisma.user_blocks.findMany({
      where: { blocker_id: user.id },
      select: {
        id: true,
        blocked_id: true,
        blocked_at: true,
        users_user_blocks_blocked_idTousers: {
          select: { display_name: true, pixel_id: true }
        }
      },
      orderBy: { blocked_at: 'desc' }
    })

    return NextResponse.json({
      blocks: blocks.map((b: any) => ({
        id: b.id,
        blockedId: b.blocked_id,
        blockedAt: b.blocked_at,
        displayName: b.users_user_blocks_blocked_idTousers.display_name || '알 수 없는 별',
        pixelId: b.users_user_blocks_blocked_idTousers.pixel_id || null,
      }))
    })
  } catch (error) {
    console.error('[Blocks GET] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST: 차단 추가
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId } = await request.json()

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    if (userId === user.id) {
      return NextResponse.json({ error: '자기 자신을 차단할 수 없습니다.' }, { status: 400 })
    }

    // 대상 존재 확인
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    })
    if (!target) {
      return NextResponse.json({ error: '존재하지 않는 사용자입니다.' }, { status: 404 })
    }

    // 차단 + 별자리 연결 해제 (트랜잭션)
    await prisma.$transaction(async (tx: any) => {
      // 1. 차단 추가
      await tx.user_blocks.create({
        data: { blocker_id: user.id, blocked_id: userId }
      })

      // 2. 기존 별자리 연결 삭제 (양방향)
      await tx.constellation_bonds.deleteMany({
        where: {
          OR: [
            { user_a_id: user.id, user_b_id: userId },
            { user_a_id: userId, user_b_id: user.id },
          ]
        }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    // Prisma P2002: UNIQUE 위반 → 이미 차단됨
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: '이미 차단된 사용자입니다.' }, { status: 409 })
    }
    console.error('[Blocks POST] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// DELETE: 차단 해제
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId } = await request.json()

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // 멱등 설계: 없어도 성공 반환
    await prisma.user_blocks.deleteMany({
      where: { blocker_id: user.id, blocked_id: userId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Blocks DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
