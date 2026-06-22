import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

/**
 * GET /api/ai/soul/settings
 * 현재 유저의 AI Soul 설정 조회
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const soul = await prisma.aiSoul.findUnique({
    where: { userId: user.id },
    select: { id: true, allowOwnerMention: true, isActive: true },
  })

  if (!soul) {
    return NextResponse.json({ hasSoul: false, allowOwnerMention: false })
  }

  return NextResponse.json({
    hasSoul: true,
    soulId: soul.id,
    allowOwnerMention: soul.allowOwnerMention,
    isActive: soul.isActive,
  })
}

/**
 * PATCH /api/ai/soul/settings
 * AI Soul 설정 업데이트 (현재: allowOwnerMention만)
 */
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { allowOwnerMention } = body

  if (typeof allowOwnerMention !== 'boolean') {
    return NextResponse.json({ error: 'allowOwnerMention must be boolean' }, { status: 400 })
  }

  const soul = await prisma.aiSoul.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })

  if (!soul) {
    return NextResponse.json({ error: 'AI Soul not found' }, { status: 404 })
  }

  await prisma.aiSoul.update({
    where: { id: soul.id },
    data: { allowOwnerMention },
  })

  return NextResponse.json({ success: true, allowOwnerMention })
}
