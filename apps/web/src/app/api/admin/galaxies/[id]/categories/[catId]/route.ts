import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

const ALLOWED_CAT_FIELDS = ['name', 'description', 'icon', 'color', 'type', 'isActive', 'sortOrder']

// Update Category
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; catId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { catId } = await params
  const body = await request.json()

  const safeData: Record<string, unknown> = {}
  for (const key of ALLOWED_CAT_FIELDS) {
    if (key in body) safeData[key] = body[key]
  }

  if (Object.keys(safeData).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
  }

  try {
    const updated = await prisma.galaxyCategory.update({
      where: { id: catId },
      data: safeData,
    })
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Admin Category PUT error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Delete Category
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; catId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { catId } = await params

  try {
    await prisma.galaxyCategory.delete({ where: { id: catId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin Category DELETE error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
