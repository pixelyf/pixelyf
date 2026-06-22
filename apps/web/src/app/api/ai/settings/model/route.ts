/**
 * [AI 모델 변경 API]
 * PATCH /api/ai/settings/model
 *
 * 요청: { primaryModel?, compactionModel? }
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

    const { primaryModel, compactionModel } = await req.json()

    const updateData: any = {}
    if (primaryModel) updateData.ai_primary_model = primaryModel
    if (compactionModel) updateData.ai_compaction_model = compactionModel

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '변경할 모델을 지정해주세요.' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[AI settings/model]:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
