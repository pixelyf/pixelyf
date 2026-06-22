import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { calculatePosition } from '@/shared/lib/coordinateCalculator'


export async function POST(request: Request) {
  try {
    // 인증: Supabase Auth만 사용
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { galaxyKey } = await request.json()

    if (!galaxyKey) {
      return NextResponse.json({ error: 'galaxyKey is required' }, { status: 400 })
    }

    // 1. 은하 존재 여부 및 활성 상태 확인 (Prisma)
    const galaxy = await prisma.galaxy.findUnique({
      where: { key: galaxyKey }
    })

    if (!galaxy || !galaxy.isActive) {
      return NextResponse.json({ error: 'Invalid or inactive galaxy' }, { status: 404 })
    }

    // 2. 이미 해당 은하에 좌표가 있는지 확인 (Prisma — 동일 커넥션 풀)
    const existingCoord = await prisma.userCoordinate.findFirst({
      where: { userId: user.id, galaxyKey },
      select: { coordX: true, coordY: true, galaxyKey: true },
    })

    if (existingCoord) {
      return NextResponse.json({
        success: true,
        existing: true,
        coordinate: {
          coordX: existingCoord.coordX,
          coordY: existingCoord.coordY,
          galaxyKey: existingCoord.galaxyKey,
        }
      })
    }

    // 3. 새 좌표 생성 — 6구간 하이브리드 알고리즘
    const existingCount = await prisma.userCoordinate.count({
      where: { galaxyKey }
    })
    const rank = existingCount + 1

    const pos = calculatePosition(rank, galaxy.centerX, galaxy.centerY, existingCount, galaxyKey, user.id)
    const coordX = pos.x
    const coordY = pos.y

    // 4. 원자적 INSERT (unique constraint 충돌 시 기존 좌표 반환)
    try {
      const newCoord = await prisma.userCoordinate.create({
        data: {
          userId: user.id,
          galaxyKey,
          coordX,
          coordY,
          zDepth: 1.0,
          glowRadius: 1.0,
          staticVector: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          dynamicVector: [],
        },
        select: { coordX: true, coordY: true, galaxyKey: true },
      })

      return NextResponse.json({
        success: true,
        existing: false,
        coordinate: {
          coordX: newCoord.coordX,
          coordY: newCoord.coordY,
          galaxyKey: newCoord.galaxyKey,
        }
      })
    } catch (createError: any) {
      // Unique constraint violation (P2002) — 동시 요청으로 이미 생성됨
      if (createError?.code === 'P2002') {
        const existing = await prisma.userCoordinate.findFirst({
          where: { userId: user.id, galaxyKey },
          select: { coordX: true, coordY: true, galaxyKey: true },
        })
        return NextResponse.json({
          success: true,
          existing: true,
          coordinate: {
            coordX: existing?.coordX,
            coordY: existing?.coordY,
            galaxyKey: existing?.galaxyKey,
          }
        })
      }
      throw createError
    }

  } catch (error) {
    console.error('Join Galaxy Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
