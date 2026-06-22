/**
 * [생각그래프] DELETE/PATCH /api/thought-graph/relationships/[id]
 * 
 * DELETE — 연결선 삭제 (status → 'rejected' 소프트 삭제, 재추론 방지)
 * PATCH  — 토스트 응답 (confirm → 'confirmed', reject → 'rejected')
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    // 인증 확인
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 연결 조회 + 소유권 검증
    const relationship = await prisma.momentRelationship.findUnique({
      where: { id },
      include: {
        source_moment: { select: { user_id: true } },
        target_moment: { select: { user_id: true } },
      },
    })

    if (!relationship) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 })
    }

    // 소유권: source 또는 target 모먼트가 로그인 유저 소유인지 확인
    const isOwner =
      relationship.source_moment.user_id === user.id ||
      relationship.target_moment.user_id === user.id

    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 소프트 삭제: status → 'rejected' (재추론 방지)
    await prisma.momentRelationship.update({
      where: { id },
      data: { status: 'rejected' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ThoughtGraph] DELETE relationship 오류:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    // 인증 확인
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action } = await request.json()

    if (!action || !['confirm', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "confirm" or "reject"' }, { status: 400 })
    }

    // 연결 조회
    const relationship = await prisma.momentRelationship.findUnique({
      where: { id },
      include: {
        source_moment: { select: { user_id: true } },
        target_moment: { select: { user_id: true } },
      },
    })

    if (!relationship) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 })
    }

    // 소유권 검증
    const isOwner =
      relationship.source_moment.user_id === user.id ||
      relationship.target_moment.user_id === user.id

    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (action === 'confirm') {
      await prisma.momentRelationship.update({
        where: { id },
        data: { status: 'confirmed' },
      })
    } else {
      // reject → status 'rejected' (재추론 방지)
      await prisma.momentRelationship.update({
        where: { id },
        data: { status: 'rejected' },
      })
    }

    return NextResponse.json({ success: true, status: action === 'confirm' ? 'confirmed' : 'rejected' })
  } catch (error) {
    console.error('[ThoughtGraph] PATCH relationship 오류:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
