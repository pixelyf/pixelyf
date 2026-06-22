import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// Create Category
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: galaxyId } = await params
  const body = await request.json()
  const { key, name, description, icon, color, type, sortOrder } = body

  if (!key || !name) {
    return NextResponse.json({ error: 'key와 name은 필수입니다.' }, { status: 400 })
  }

  try {
    const category = await prisma.galaxyCategory.create({
      data: {
        galaxyId,
        key,
        name,
        description: description || null,
        icon: icon || null,
        color: color || null,
        type: type || 'content_tag',
        sortOrder: sortOrder ?? 0,
      }
    })
    return NextResponse.json({ data: category })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: `이 은하에 이미 '${key}' 키가 존재합니다.` }, { status: 409 })
    }
    console.error('Admin Category POST error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
