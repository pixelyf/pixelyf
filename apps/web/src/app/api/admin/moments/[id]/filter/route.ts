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
  const { is_deleted, is_filtered, filter_reason } = await request.json()

  try {
    const moment = await prisma.moment.update({
      where: { id },
      data: { is_deleted, is_filtered, filter_reason }
    })

    return NextResponse.json({ success: true, data: moment })
  } catch (error) {
    console.error('Admin Moment Filter PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
