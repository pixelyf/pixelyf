import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // [멀티 아바타 조회] 유저가 가진 모든 은하 좌표를 조회
    const userCoords = await prisma.userCoordinate.findMany({
      where: {
        userId: userId,
        galaxyKey: { not: null }
      },
      select: {
        galaxyKey: true,
        coordX: true,
        coordY: true,
      }
    })

    if (!userCoords || userCoords.length === 0) {
      return NextResponse.json({ coordinates: {} })
    }

    // galaxyKey를 키로 하는 객체로 변환
    const coordsMap = userCoords.reduce((acc, curr) => {
      if (curr.galaxyKey) {
        acc[curr.galaxyKey] = {
          coordX: curr.coordX,
          coordY: curr.coordY
        }
      }
      return acc
    }, {} as Record<string, { coordX: number; coordY: number }>)

    return NextResponse.json({ coordinates: coordsMap })
  } catch (error) {
    console.error('Failed to fetch user coordinates:', error)
    return NextResponse.json({ error: 'Failed to fetch coordinates' }, { status: 500 })
  }
}
