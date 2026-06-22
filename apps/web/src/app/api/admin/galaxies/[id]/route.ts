import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// 허용된 수정 필드 화이트리스트
const ALLOWED_FIELDS = [
  'name', 'description', 'icon', 'color',
  'centerX', 'centerY', 'joinType', 'isActive', 'isRoot', 'sortOrder',
]

// Update Galaxy
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

  // 화이트리스트 필터링: 허용된 필드만 통과
  const safeData: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) safeData[key] = body[key]
  }

  if (Object.keys(safeData).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
  }

  try {
    const updated = await prisma.galaxy.update({
      where: { id },
      data: safeData,
      include: { categories: { orderBy: { sortOrder: 'asc' } } }
    })
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Admin Galaxy PUT error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Delete Galaxy
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  try {
    // 최상위 기본 은하(픽셀리프) 삭제 방지
    const galaxy = await prisma.galaxy.findUnique({ where: { id } })
    if (!galaxy) {
      return NextResponse.json({ error: '은하를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (galaxy.isRoot || galaxy.key === 'PIXELYF' || galaxy.partnerCode === 'pixelyf') {
      return NextResponse.json({ error: '최상위 기본 은하(픽셀리프)는 삭제할 수 없습니다.' }, { status: 400 })
    }

    // 물리적 삭제 대신 논리적 삭제(Soft Delete) 적용: isActive 플래그를 false로 수정
    await prisma.galaxy.update({
      where: { id },
      data: { isActive: false }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin Galaxy DELETE error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
