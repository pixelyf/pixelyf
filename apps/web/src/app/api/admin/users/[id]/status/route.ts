import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role === 'USER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { is_active, is_shadow_banned, shadow_ban_reason } = body

  try {
    const dataToUpdate: any = {}
    if (typeof is_active === 'boolean') dataToUpdate.is_active = is_active
    if (typeof is_shadow_banned === 'boolean') dataToUpdate.is_shadow_banned = is_shadow_banned
    if (shadow_ban_reason !== undefined) dataToUpdate.shadow_ban_reason = shadow_ban_reason

    const updatedUser = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: { id: true, is_active: true, is_shadow_banned: true, shadow_ban_reason: true }
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Admin User Status PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
