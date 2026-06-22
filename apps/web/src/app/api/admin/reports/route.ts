import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role === 'USER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const reports = await prisma.user_reports.findMany({
      where: { status: '"pending"' }, // Prisma default mapped to string '"pending"' in schema earlier?
      orderBy: { created_at: 'desc' },
      include: {
        users_user_reports_reporter_idTousers: { select: { display_name: true, pixel_id: true } },
        users_user_reports_reported_idTousers: { select: { display_name: true, pixel_id: true, is_shadow_banned: true } },
        moments: { select: { content: true, is_deleted: true, is_filtered: true } }
      }
    })

    return NextResponse.json({ data: reports })
  } catch (error) {
    console.error('Admin Reports GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

