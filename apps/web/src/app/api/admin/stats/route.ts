import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import { requirePermission } from '@/shared/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
    const permission = await requirePermission(user.id, 'stats:read', clientIp)
    if (!permission.isAuthorized) {
      return NextResponse.json({ error: 'Forbidden', reason: permission.reason }, { status: 403 })
    }

    // 오늘 시작 시각 (UTC 기준)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // ── 병렬 쿼리 실행 ──
    const [
      totalUsers,
      activeUsers,
      shadowBannedUsers,
      inactiveUsers,
      newUsersToday,
      totalMoments,
      deletedMoments,
      newMomentsToday,
      pendingReports,
      totalReportsApproved,
      totalReportsDismissed,
      galaxyCoordCounts,
      recentUsers,
      recentMoments,
      recentReports,
      totalPings,
      totalBonds,
      totalSubscriptions,
      allGalaxies,
    ] = await Promise.all([
      // 사용자 통계
      prisma.user.count(),
      prisma.user.count({ where: { is_active: true } }),
      prisma.user.count({ where: { is_shadow_banned: true } }),
      prisma.user.count({ where: { is_active: false } }),
      prisma.user.count({ where: { created_at: { gte: today } } }),

      // 모먼트 통계
      prisma.moment.count(),
      prisma.moment.count({ where: { is_deleted: true } }),
      prisma.moment.count({ where: { created_at: { gte: today } } }),

      // 신고 통계
      prisma.user_reports.count({ where: { status: 'PENDING' } }),
      prisma.user_reports.count({ where: { status: 'APPROVED' } }),
      prisma.user_reports.count({ where: { status: 'DISMISSED' } }),

      // 은하별 좌표 수
      prisma.$queryRaw<{ galaxy_key: string; count: bigint }[]>`
        SELECT galaxy_key, COUNT(*) as count 
        FROM user_coordinates 
        WHERE galaxy_key IS NOT NULL 
        GROUP BY galaxy_key
      `,

      // 최근 가입 5명
      prisma.user.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          display_name: true,
          pixel_id: true,
          supernova_tier: true,
          created_at: true,
        }
      }),

      // 최근 모먼트 5개
      prisma.moment.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          content: true,
          category: true,
          is_deleted: true,
          created_at: true,
          user: {
            select: { display_name: true, pixel_id: true }
          }
        }
      }),

      // 최근 신고 3건
      prisma.user_reports.findMany({
        take: 3,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          reason: true,
          status: true,
          created_at: true,
          users_user_reports_reporter_idTousers: {
            select: { display_name: true }
          },
          users_user_reports_reported_idTousers: {
            select: { display_name: true }
          },
        }
      }),

      // 소셜 통계
      prisma.ping.count(),
      prisma.constellation_bonds.count(),
      prisma.thought_subscriptions.count(),
      // 모든 은하 목록 조회
      prisma.galaxy.findMany({ select: { key: true } }),
    ])

    // 은하별 통계 매핑 (DB 데이터를 활용한 동적 루프)
    const galaxyStats = allGalaxies.map(g => {
      const key = g.key
      const found = galaxyCoordCounts.find((gCount: any) => gCount.galaxy_key === key)
      return {
        key,
        coordCount: found ? Number(found.count) : 0,
      }
    })

    return NextResponse.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        banned: inactiveUsers,
        shadowBanned: shadowBannedUsers,
        newToday: newUsersToday,
      },
      moments: {
        total: totalMoments,
        deleted: deletedMoments,
        newToday: newMomentsToday,
      },
      reports: {
        pending: pendingReports,
        approved: totalReportsApproved,
        dismissed: totalReportsDismissed,
      },
      social: {
        totalPings: totalPings,
        totalBonds: totalBonds,
        totalSubscriptions: totalSubscriptions,
      },
      galaxies: galaxyStats,
      recent: {
        users: recentUsers,
        moments: recentMoments,
        reports: recentReports,
      }
    })
  } catch (error) {
    console.error('[Admin Stats Error]:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
