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

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const search = searchParams.get('search') || ''
  
  const skip = (page - 1) * limit

  try {
    const whereClause: any = {}
    if (search) {
      whereClause.content = { contains: search, mode: 'insensitive' }
    }

    const [moments, total] = await Promise.all([
      prisma.moment.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { display_name: true, pixel_id: true, is_shadow_banned: true, country: true } }
        }
      }),
      prisma.moment.count({ where: whereClause })
    ])

    return NextResponse.json({
      data: moments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    })
  } catch (error) {
    console.error('Admin Moments GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

