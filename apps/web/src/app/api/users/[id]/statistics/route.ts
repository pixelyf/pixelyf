import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const { searchParams } = new URL(request.url)
    const galaxyKey = searchParams.get('galaxy') || 'PIXELYF'

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // 1. 기본 카운트 및 통계 데이터 조회 (Promise.all 1)
    const [
      stats,
      touchesCount,
      bondsCount,
      subscriptionsCount,
      commentsCount,
      crystalPingsCount,
      pingTypesGroup,
      momentsCount
    ] = await Promise.all([
      // 1. 방문자 통계 (compound key: user_id + galaxy_key)
      prisma.userStatistics.findUnique({
        where: { user_id_galaxy_key: { user_id: targetId, galaxy_key: galaxyKey } }
      }),
      
      // 2. 터치 횟수
      prisma.touches.count({ where: { touched_id: targetId, galaxy_key: galaxyKey } }),
      
      // 3. 연결된 별자리 (활성화 상태, 같은 은하)
      prisma.constellation_bonds.count({
        where: {
          OR: [{ user_a_id: targetId }, { user_b_id: targetId }],
          status: 'accepted',
          galaxy_key: galaxyKey,  // [GALAXY FIX] 은하별 bonds 독립
        }
      }),
      
      // 4. 활성 구독자 수
      prisma.thought_subscriptions.count({ 
        where: { creator_id: targetId, status: 'active' } 
      }),
      
      // 5. 받은 총 댓글 수
      prisma.momentComment.count({
        where: {
          moment: { user_id: targetId, galaxy_key: galaxyKey },
          is_deleted: false
        }
      }),
      
      // 6. 초신성(슈퍼핑) 수신 횟수
      prisma.ping.count({ 
        where: { receiver_id: targetId, is_crystal: true, galaxy_key: galaxyKey } 
      }),
      
      // 7. 일반 핑 타입별 집계
      prisma.ping.groupBy({
        by: ['ping_type'],
        where: { receiver_id: targetId, is_crystal: false, galaxy_key: galaxyKey },
        _count: { _all: true }
      }),
      
      // 8. 작성한 피드 수
      prisma.moment.count({
        where: { user_id: targetId, is_deleted: false, galaxy_key: galaxyKey }
      })
    ])

    // 2. 상세 유저 목록 조회 (Promise.all 2로 분리하여 TS 튜플 추론 보호)
    const [
      recentVisits,
      recentPings,
      recentTouches,
      recentComments
    ] = await Promise.all([
      // 9. 오늘 방문자 리스트 (최근 30개)
      prisma.pixelVisitLog.findMany({
        where: {
          target_pixel_id: targetId,
          galaxy_key: galaxyKey,
          created_at: { gte: todayStart }
        },
        include: {
          visitor: {
            select: {
              id: true,
              display_name: true,
              avatar_image_url: true,
              current_mood_id: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 30
      }),

      // 10. 받은 핑 리스트 (최근 30개)
      prisma.ping.findMany({
        where: { receiver_id: targetId, galaxy_key: galaxyKey },
        include: {
          sender: {
            select: {
              id: true,
              display_name: true,
              avatar_image_url: true,
              current_mood_id: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 30
      }),

      // 11. 받은 터치 리스트 (최근 30개)
      prisma.touches.findMany({
        where: { touched_id: targetId, galaxy_key: galaxyKey },
        include: {
          users_touches_toucher_idTousers: {
            select: {
              id: true,
              display_name: true,
              avatar_image_url: true,
              current_mood_id: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 30
      }),

      // 12. 받은 댓글 리스트 (최근 30개)
      prisma.momentComment.findMany({
        where: {
          moment: { user_id: targetId, galaxy_key: galaxyKey },
          is_deleted: false
        },
        include: {
          user: {
            select: {
              id: true,
              display_name: true,
              avatar_image_url: true,
              current_mood_id: true
            }
          },
          moment: {
            select: {
              id: true,
              content: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 30
      })
    ])

    const pingStats = pingTypesGroup
      .map(p => ({
        ping_type: p.ping_type,
        count: p._count._all
      }))
      .sort((a, b) => b.count - a.count)

    const totalPings = pingStats.reduce((acc, p) => acc + p.count, 0) + crystalPingsCount

    // 조인된 데이터 포맷팅 및 any 강제 캐스팅 (Prisma 타입 정합성 우회)
    const visitsList = (recentVisits as any[]).map(v => ({
      id: v.visitor.id,
      displayName: v.visitor.display_name,
      avatarUrl: v.visitor.avatar_image_url,
      currentMoodId: v.visitor.current_mood_id,
      createdAt: v.created_at
    }))

    const pingsList = (recentPings as any[]).map(p => ({
      id: p.sender.id,
      displayName: p.sender.display_name,
      avatarUrl: p.sender.avatar_image_url,
      currentMoodId: p.sender.current_mood_id,
      pingType: p.ping_type,
      isCrystal: p.is_crystal,
      createdAt: p.created_at
    }))

    const touchesList = (recentTouches as any[]).map(t => {
      const toucher = t.users_touches_toucher_idTousers
      return {
        id: toucher.id,
        displayName: toucher.display_name,
        avatarUrl: toucher.avatar_image_url,
        currentMoodId: toucher.current_mood_id,
        createdAt: t.created_at
      }
    })

    const commentsList = (recentComments as any[]).map(c => ({
      id: c.user.id,
      displayName: c.user.display_name,
      avatarUrl: c.user.avatar_image_url,
      currentMoodId: c.user.current_mood_id,
      commentId: c.id,
      content: c.content,
      momentId: c.moment_id,
      momentContent: c.moment.content,
      createdAt: c.created_at
    }))

    return NextResponse.json({
      success: true,
      data: {
        visits: stats || { today_visits: 0, yesterday_visits: 0, total_visits: 0 },
        touches: touchesCount,
        bonds: bondsCount,
        subscriptions: subscriptionsCount,
        comments: commentsCount,
        supernovas: crystalPingsCount,
        pings: pingStats,
        totalPings: totalPings,
        momentsCount: momentsCount,
        recentVisitsList: visitsList,
        recentPingsList: pingsList,
        recentTouchesList: touchesList,
        recentCommentsList: commentsList
      }
    })
  } catch (error) {
    console.error('Fetch Statistics Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
