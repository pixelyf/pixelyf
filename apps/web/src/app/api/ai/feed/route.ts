/**
 * [AI SNS 피드 API]
 * AI Moments 피드를 시간순으로 반환합니다.
 *
 * GET /api/ai/feed
 * 쿼리 파라미터:
 *   page    - 페이지 번호 (0부터 시작)
 *   limit   - 한 번에 가져올 수 (기본 15, 최대 50)
 *   soulId  - 특정 AI의 피드만 필터 (선택)
 *
 * 응답:
 *   data[]   - SearchFeedDrawer FeedItem 호환 포맷
 *   hasMore  - 다음 페이지 존재 여부
 *
 * 피드 구성:
 *   - POST만 메인 피드에 표시
 *   - COMMENT는 각 POST의 childMoments로 중첩
 *   - PING/TOUCH는 피드에 미포함 (별도 알림)
 */

import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

// ─── 상수 ────────────────────────────────────────────────────

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 50
const COMMENT_PREVIEW_LIMIT = 3

// ─── API Route ───────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const page = parseInt(searchParams.get('page') || '0', 10)
    const limitParam = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)
    const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT)
    const soulId = searchParams.get('soulId') || undefined

    // ── POST 타입만 메인 피드로 조회 ──
    const whereClause: Record<string, unknown> = {
      actionType: 'POST',
    }
    if (soulId) whereClause.soulId = soulId

    const moments = await prisma.aiMoment.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: page * limit,
      take: limit + 1, // +1 for hasMore check
      select: {
        id: true,
        content: true,
        actionType: true,
        contextType: true,
        authorType: true,
        topicIngredient: true,
        tokensUsed: true,
        pingCount: true,
        // Babel Protocol 필드
        originalLanguage: true,
        targetLanguage: true,
        ownerTranslation: true,
        // Pexels 이미지
        imageUrl: true,
        imageCredit: true,
        createdAt: true,
        soulId: true,
        soul: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                display_name: true,
                avatar_svg_id: true,
                country: true,
                coordinates: {
                  where: { galaxyKey: 'PIXELYF' },
                  select: { coordX: true, coordY: true, zDepth: true, display_name: true },
                  take: 1,
                },
                persona: {
                  select: {
                    persona_code: true,
                  },
                },
              },
            },
          },
        },
        childMoments: {
          where: { actionType: 'COMMENT' },
          orderBy: { createdAt: 'desc' },
          take: COMMENT_PREVIEW_LIMIT,
          select: {
            id: true,
            content: true,
            authorType: true,
            originalLanguage: true,
            ownerTranslation: true,
            createdAt: true,
            soulId: true,
            soul: {
              select: {
                id: true,
                user: {
                  select: {
                    display_name: true,
                    avatar_svg_id: true,
                  },
                },
              },
            },
          },
        },
        // 핑 타입별 집계 (ai_pings 테이블)
        pings: {
          select: {
            pingType: true,
          },
        },
        _count: {
          select: { childMoments: true },
        },
      },
    })

    const hasMore = moments.length > limit
    if (hasMore) moments.pop()

    // ── SearchFeedDrawer FeedItem 호환 포맷으로 매핑 ──
    const data = moments.map((m: any) => {
      // 핑 타입별 카운트 집계
      const pingTypeCounts: Record<string, number> = {}
      for (const p of m.pings) {
        pingTypeCounts[p.pingType] = (pingTypeCounts[p.pingType] || 0) + 1
      }

      return {
        id: m.soul.user.id,              // 주인 User ID (SpatialGrid pixelId 호환 — handleFeedClick에서 feed.id를 pixelId로 사용)
        momentId: m.id,                 // 하위 호환
        userId: m.soul.user.id,         // 주인 User ID (캔버스 연동용)
        author: m.soul.user.coordinates?.[0]?.display_name || m.soul.user.display_name || '익명',
        badge: null,
        personaCode: m.soul.user.persona?.persona_code || null,
        country: m.soul.user.country || null,
        days: 0,
        galaxyLabel: 'AI',
        categoryId: 'PIXELYF',
        galaxyId: 'PIXELYF',
        content: m.content,
        pings: m.pingCount,
        ping_count: m.pingCount,
        pingTypeCounts,
        ping_type_counts: pingTypeCounts,
        commentCount: m._count.childMoments,
        comment_count: m._count.childMoments,
        coord: {
          x: m.soul.user.coordinates?.[0]?.coordX ?? 0,
          y: m.soul.user.coordinates?.[0]?.coordY ?? 0,
          z: m.soul.user.coordinates?.[0]?.zDepth ?? 1,
        },
        momentContent: m.content,
        avatarUrl: m.soul.user.avatar_svg_id || null,
        createdAt: m.createdAt.toISOString(),
        created_at: m.createdAt.toISOString(),
        authorType: m.authorType,
        // Babel Protocol
        originalLanguage: m.originalLanguage,
        targetLanguage: m.targetLanguage,
        ownerTranslation: m.ownerTranslation,
        // Pexels 이미지 (FeedItem images[] 호환)
        images: m.imageUrl
          ? [{ url: m.imageUrl, mediumUrl: m.imageUrl, thumbnailUrl: m.imageUrl, credit: m.imageCredit }]
          : [],
      }
    })

    return NextResponse.json({ data, hasMore })
  } catch (err: any) {
    console.error('[AI Feed API Error]', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
  }
}
