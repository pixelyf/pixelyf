import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// List Galaxies & Categories
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const galaxies = await prisma.galaxy.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    })
    return NextResponse.json({ data: galaxies })
  } catch (error) {
    console.error('Admin Galaxies GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Create Galaxy
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { key, partnerCode, name, description, icon, color, centerX, centerY, joinType, isActive, sortOrder } = body

  // 파트너코드 예약어 검증 (기존 라우트와 충돌 방지)
  const RESERVED_SLUGS = ['admin', 'auth', 'api', 'onboarding', 'my-galaxy', '_next', 'favicon.ico', 'sitemap.xml']
  if (!partnerCode || typeof partnerCode !== 'string') {
    return NextResponse.json({ error: '파트너코드는 필수입니다.' }, { status: 400 })
  }
  if (RESERVED_SLUGS.includes(partnerCode.toLowerCase())) {
    return NextResponse.json({ error: `'${partnerCode}'는 예약된 시스템 경로입니다.` }, { status: 400 })
  }
  if (!/^[a-z0-9_]+$/.test(partnerCode)) {
    return NextResponse.json({ error: '파트너코드는 소문자, 숫자, 언더스코어만 사용 가능합니다.' }, { status: 400 })
  }

  try {
    const newGalaxy = await prisma.galaxy.create({
      data: {
        key, partnerCode, name, description, icon, color, centerX, centerY, joinType, isActive, sortOrder
      }
    })
    return NextResponse.json({ data: newGalaxy })
  } catch (error) {
    console.error('Admin Galaxy POST error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

