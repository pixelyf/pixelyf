import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// Update Category
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  try {
    const updated = await prisma.galaxyCategory.update({
      where: { id },
      data: body
    })

    // [BFP 실시간 다국어] 카테고리명이나 설명 수정 시 다국어 번역 즉각 갱신
    if (body.name !== undefined || body.description !== undefined) {
      const { BabelTranslationService } = await import('@/shared/lib/ai/babelTranslationService')
      await BabelTranslationService.translateAndSaveCategory({
        categoryId: updated.id,
        name: updated.name,
        description: updated.description || undefined,
        adminUserId: adminUser.id,
      })
    }

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Admin Category PUT error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
