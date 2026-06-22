import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { searchParams } = new URL(request.url)
    const galaxyKey = searchParams.get('galaxy') || 'PIXELYF'

    // 현재 통계 조회를 위한 헬퍼 함수
    const getStats = async () => {
      const s = await prisma.userStatistics.findUnique({
        where: { user_id_galaxy_key: { user_id: targetId, galaxy_key: galaxyKey } }
      })
      return s || { today_visits: 0, yesterday_visits: 0, total_visits: 0 }
    }

    if (!user) {
      // ── 비회원(게스트) 방문 처리 (Cookie 기반 쿨다운) ──
      const cookieStore = await cookies()
      const visitedStr = cookieStore.get('guest_visits')?.value || '[]'
      let visited: string[] = []
      try { visited = JSON.parse(visitedStr) } catch {}

      if (visited.includes(targetId)) {
        return NextResponse.json({ success: true, message: 'Cooldown active', data: await getStats() })
      }

      // 쿨다운 등록 (12시간 유지, 최대 50개 제한)
      visited.push(targetId)
      if (visited.length > 50) visited = visited.slice(-50)
      cookieStore.set('guest_visits', JSON.stringify(visited), {
        maxAge: 12 * 60 * 60,
        httpOnly: true,
        path: '/'
      })

      // 로그 테이블 기록 없이 바로 통계만 업데이트
      const stats = await prisma.userStatistics.upsert({
        where: { user_id_galaxy_key: { user_id: targetId, galaxy_key: galaxyKey } },
        update: {
          today_visits: { increment: 1 },
          total_visits: { increment: 1 }
        },
        create: {
          user_id: targetId,
          galaxy_key: galaxyKey,
          today_visits: 1,
          total_visits: 1,
          yesterday_visits: 0
        }
      })

      return NextResponse.json({ success: true, data: stats })
    }

    // ── 회원 방문 처리 (DB 기반 쿨다운) ──
    const visitorId = user.id
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

    // 12시간 이내 방문 기록 검사
    const recentVisit = await prisma.pixelVisitLog.findFirst({
      where: {
        target_pixel_id: targetId,
        visitor_id: visitorId,
        created_at: {
          gte: twelveHoursAgo
        }
      }
    })

    if (recentVisit) {
      return NextResponse.json({ success: true, message: 'Cooldown active', data: await getStats() })
    }

    // 트랜잭션을 통한 로그 생성 및 통계 증분
    const result = await prisma.$transaction(async (tx) => {
      await tx.pixelVisitLog.create({
        data: {
          target_pixel_id: targetId,
          visitor_id: visitorId,
          galaxy_key: galaxyKey
        }
      })

      const stats = await tx.userStatistics.upsert({
        where: { user_id_galaxy_key: { user_id: targetId, galaxy_key: galaxyKey } },
        update: {
          today_visits: { increment: 1 },
          total_visits: { increment: 1 }
        },
        create: {
          user_id: targetId,
          galaxy_key: galaxyKey,
          today_visits: 1,
          total_visits: 1,
          yesterday_visits: 0
        }
      })

      return stats
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Record Visit Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
