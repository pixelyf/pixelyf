import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// Create Category
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()

  try {
    const newCategory = await prisma.galaxyCategory.create({
      data: body
    })

    // [BFP 실시간 다국어] 신규 카테고리에 대해 즉각 11개 국어 번역 수행 및 적재
    const { BabelTranslationService } = await import('@/shared/lib/ai/babelTranslationService')
    await BabelTranslationService.translateAndSaveCategory({
      categoryId: newCategory.id,
      name: newCategory.name,
      description: newCategory.description || undefined,
      adminUserId: adminUser.id,
    })

    return NextResponse.json({ data: newCategory })
  } catch (error) {
    console.error('Admin Category POST error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

