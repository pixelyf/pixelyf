import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check role
  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role === 'USER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const search = searchParams.get('search') || ''
  
  const skip = (page - 1) * limit

  try {
    const whereClause: any = {}
    if (search) {
      whereClause.OR = [
        { display_name: { contains: search, mode: 'insensitive' } },
        { pixel_id: { contains: search, mode: 'insensitive' } }
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          pixel_id: true,
          display_name: true,
          role: true,
          activity_score: true,
          stardust_balance: true,
          is_active: true,
          is_shadow_banned: true,
          created_at: true,
          country: true,
          persona: { select: { persona_code: true } },
        }
      }),
      prisma.user.count({ where: whereClause })
    ])

    const userIds = users.map((u: any) => u.id)
    
    // Fallback manual count aggregation to bypass Prisma P2023 subquery bug
    const [touchesData, momentsData, bondsAData, bondsBData, commentsData, pingsData] = await Promise.all([
      prisma.touches.groupBy({ by: ['touched_id'], where: { touched_id: { in: userIds } }, _count: true }),
      prisma.moment.groupBy({ by: ['user_id'], where: { user_id: { in: userIds } }, _count: true }),
      prisma.constellation_bonds.groupBy({ by: ['user_a_id'], where: { user_a_id: { in: userIds } }, _count: true }),
      prisma.constellation_bonds.groupBy({ by: ['user_b_id'], where: { user_b_id: { in: userIds } }, _count: true }),
      prisma.momentComment.groupBy({ by: ['user_id'], where: { user_id: { in: userIds } }, _count: true }),
      prisma.ping.groupBy({ by: ['receiver_id'], where: { receiver_id: { in: userIds } }, _count: true })
    ])

    const countMap = Object.fromEntries(userIds.map((id: any) => [id, {
      touches_touches_touched_idTousers: touchesData.find((d: any) => d.touched_id === id)?._count || 0,
      moments: momentsData.find((d: any) => d.user_id === id)?._count || 0,
      constellation_bonds_constellation_bonds_user_a_idTousers: bondsAData.find((d: any) => d.user_a_id === id)?._count || 0,
      constellation_bonds_constellation_bonds_user_b_idTousers: bondsBData.find((d: any) => d.user_b_id === id)?._count || 0,
      momentComments: commentsData.find((d: any) => d.user_id === id)?._count || 0,
      pings_received: pingsData.find((d: any) => d.receiver_id === id)?._count || 0,
    }]))

    // BigInt serialization fix and append counts
    const serializedUsers = users.map((u: any) => ({
      ...u,
      activity_score: u.activity_score.toString(),
      _count: countMap[u.id]
    }))

    return NextResponse.json({
      data: serializedUsers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Admin Users GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

