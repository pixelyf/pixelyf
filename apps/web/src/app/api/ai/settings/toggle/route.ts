/**
 * [AI 활성화 토글 API]
 * PATCH /api/ai/settings/toggle
 *
 * AiSoul.isActive + User.ai_enabled 동시 토글
 * 요청: { enabled: boolean }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { enabled } = await req.json()
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled 값이 필요합니다.' }, { status: 400 })
    }

    // AiSoul 존재 확인
    const soul = await prisma.aiSoul.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (!soul) {
      return NextResponse.json({ error: 'AI 분신이 존재하지 않습니다. 먼저 온보딩을 완료해주세요.' }, { status: 404 })
    }

    // 동시 토글
    await prisma.$transaction([
      prisma.aiSoul.update({
        where: { userId: user.id },
        data: { isActive: enabled },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { ai_enabled: enabled },
      }),
    ])

    return NextResponse.json({ success: true, enabled })

  } catch (error: any) {
    console.error('[AI settings/toggle]:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
