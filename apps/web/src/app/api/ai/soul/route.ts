/**
 * [AI Soul 조회 API]
 * userId로 AiSoul ID를 조회합니다.
 *
 * GET /api/ai/soul?userId=<uuid>
 */

import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const soul = await prisma.aiSoul.findUnique({
      where: { userId },
      select: { id: true },
    })

    if (!soul) {
      return NextResponse.json({ soulId: null })
    }

    return NextResponse.json({ soulId: soul.id })
  } catch (err: any) {
    console.error('[AI Soul API Error]', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
  }
}
