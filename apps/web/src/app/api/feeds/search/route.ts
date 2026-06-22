import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { Prisma } from '@prisma/client'
import { createClient } from '@/shared/lib/supabase/server'

// 인메모리 캐시 (서버리스 환경에서 인스턴스 유지 동안 활용)
// 로케일별 카테고리 번역 인메모리 캐시: { "en": { "mood": "Thought" }, "ko": { "mood": "생각" } }
let cachedCategories: Record<string, Record<string, string>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10분

async function getCategories() {
  const now = Date.now();
  if (cachedCategories && (now - cacheTimestamp < CACHE_TTL)) {
    return cachedCategories;
  }

  const dynamicCats = await prisma.galaxyCategory.findMany({
    select: {
      key: true,
      name: true,
      translations: {
        select: { locale: true, name: true }
      }
    }
  });

  const newCategories: Record<string, Record<string, string>> = {};
  dynamicCats.forEach(c => {
    if (!newCategories['ko']) newCategories['ko'] = {};
    newCategories['ko'][c.key] = c.name;

    c.translations.forEach(t => {
      if (!newCategories[t.locale]) newCategories[t.locale] = {};
      newCategories[t.locale][c.key] = t.name;
    });
  });

  cachedCategories = newCategories;
  cacheTimestamp = now;
  return cachedCategories;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Phase 1: 로그인 유저 세션 검증 & 카테고리 캐시 조회를 동시에 1차 병렬 실행
    const [authRes, categories] = await Promise.all([
      supabase.auth.getUser(),
      getCategories()
    ])

    const user = authRes.data?.user

    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') || 'latest'
    const feedType = searchParams.get('feedType') || null
    const scope = searchParams.get('scope') || 'global'
    const mode = searchParams.get('mode') || 'content'
    const q = searchParams.get('q') || ''
    const galaxy = searchParams.get('galaxy') || null
    const category = searchParams.get('category') || null
    const page = parseInt(searchParams.get('page') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '15', 10)
    const viewerLang = searchParams.get('lang') || 'ko'

    // 1. Where 절 구성
    const where: Prisma.MomentWhereInput = {
      is_deleted: false,
    }

    if (feedType === 'community' || feedType === 'review') {
      where.target_pixel_id = { not: null }
    } else if (feedType === 'moment') {
      where.target_pixel_id = null
    }

    if (galaxy) {
      where.galaxy_key = galaxy
    }

    if (category) {
      where.OR = [
        { contentCategory: category },
        { contentCategory: null, category },
      ]
    }

    if (q.trim()) {
      if (mode === 'nickname') {
        where.user = { display_name: { contains: q.trim(), mode: 'insensitive' } }
      } else {
        where.content = { contains: q.trim(), mode: 'insensitive' }
      }
    }

    if (tab === 'gallery') {
      where.images = { not: Prisma.AnyNull }
    }

    // 2. OrderBy 절 구성 (DB 네이티브 정렬)
    let orderBy: Prisma.MomentOrderByWithRelationInput | Prisma.MomentOrderByWithRelationInput[] = []
    
    if (tab === 'hot') {
      orderBy = [
        { ping_count: 'desc' },
        { created_at: 'desc' }
      ]
    } else if (tab === 'top_pixelyear') {
      orderBy = [
        { user: { activity_score: 'desc' } },
        { created_at: 'desc' }
      ]
    } else {
      orderBy = { created_at: 'desc' }
    }

    // Phase 2: 로그인 유저가 존재하면 구독 관계 조회를 병렬 수행.
    // 그리고 scope !== 'bonds' 라면 moments 조회도 동시에 2차 병렬 실행 가능!
    // scope === 'bonds' 라면 constellation_bonds 조회를 실행!
    
    const bondsPromise = (user && scope === 'bonds') ? prisma.constellation_bonds.findMany({
      where: {
        OR: [
          { user_a_id: user.id },
          { user_b_id: user.id }
        ],
        status: 'accepted'
      },
      select: { user_a_id: true, user_b_id: true }
    }) : Promise.resolve(null)

    const subsPromise = user ? prisma.thought_subscriptions.findMany({
      where: { subscriber_id: user.id, status: 'active' },
      select: { creator_id: true },
    }) : Promise.resolve([])

    const momentsPromise = (scope !== 'bonds') ? prisma.moment.findMany({
      where,
      orderBy,
      skip: page * limit,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            display_name: true,
            avatar_image_url: true,
            activity_score: true,
            created_at: true,
            country: true,
            current_mood_id: true,
            persona: { select: { persona_code: true } },
            is_store: true,
            store_detail: {
              select: {
                average_rating: true,
                review_count: true
              }
            },
            coordinates: {
              where: { galaxyKey: galaxy || 'PIXELYF' },
              take: 1,
              select: { coordX: true, coordY: true, zDepth: true }
            }
          }
        },
        target_pixel: {
          select: {
            id: true,
            display_name: true,
            avatar_image_url: true,
            coordinates: {
              where: { galaxyKey: galaxy || 'PIXELYF' },
              take: 1,
              select: { coordX: true, coordY: true, zDepth: true }
            }
          }
        },
        translations: {
          where: { status: 'completed' },
          select: { locale: true, content: true }
        }
      }
    }) : Promise.resolve(null)

    const [activeSubs, bondsRes, momentsResPhase2] = await Promise.all([
      subsPromise,
      bondsPromise,
      momentsPromise
    ])

    let subscribedCreatorIds = new Set<string>()
    if (activeSubs) {
      subscribedCreatorIds = new Set(activeSubs.map(s => s.creator_id))
    }

    let moments: any[] = []

    // Phase 3: scope === 'bonds'인 경우, bonds 획득한 ID 기반으로 moments 조회 실행
    if (scope === 'bonds') {
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized for bonds feed' }, { status: 401 })
      }
      const connectedUserIds = bondsRes ? bondsRes.map(b => b.user_a_id === user.id ? b.user_b_id : b.user_a_id) : []
      if (connectedUserIds.length === 0) {
        return NextResponse.json({ data: [], hasMore: false, totalCount: 0 })
      }
      where.user_id = { in: connectedUserIds }

      moments = await prisma.moment.findMany({
        where,
        orderBy,
        skip: page * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              display_name: true,
              avatar_image_url: true,
              activity_score: true,
              created_at: true,
              country: true,
              current_mood_id: true,
              persona: { select: { persona_code: true } },
              is_store: true,
              store_detail: {
                select: {
                  average_rating: true,
                  review_count: true
                }
              },
              coordinates: {
                where: { galaxyKey: galaxy || 'PIXELYF' },
                take: 1,
                select: { coordX: true, coordY: true, zDepth: true }
              }
            }
          },
          target_pixel: {
            select: {
              id: true,
              display_name: true,
              avatar_image_url: true,
              coordinates: {
                where: { galaxyKey: galaxy || 'PIXELYF' },
                take: 1,
                select: { coordX: true, coordY: true, zDepth: true }
              }
            }
          },
          translations: {
            where: { status: 'completed' },
            select: { locale: true, content: true }
          }
        }
      })
    } else {
      moments = momentsResPhase2 || []
    }

    const momentIds = moments.map(m => m.id)

    // Phase 4: 핑 집계 groupBy 실행 (moments ID 확정 직후)
    const pingCountsAgg = momentIds.length > 0 ? await prisma.ping.groupBy({
      by: ['moment_id', 'ping_type'],
      where: { moment_id: { in: momentIds } },
      _count: { _all: true }
    }) : []

    const pingTypeMap: Record<string, Record<string, number>> = {}
    pingCountsAgg.forEach(p => {
      if (p.moment_id) {
        if (!pingTypeMap[p.moment_id]) pingTypeMap[p.moment_id] = {}
        pingTypeMap[p.moment_id][p.ping_type] = p._count._all
      }
    })



    const mapped = moments.map(m => {
      const userObj = m.user
      const coordObj = userObj?.coordinates?.[0] || null
      const targetPixelObj = m.target_pixel
      const targetCoordObj = targetPixelObj?.coordinates?.[0] || null

      let days = 0
      if (userObj?.created_at) {
        const diff = Date.now() - new Date(userObj.created_at).getTime()
        days = Math.floor(diff / (1000 * 60 * 60 * 24))
      }

      const pingTypeCounts = pingTypeMap[m.id] || {}
      const totalPings = Object.values(pingTypeCounts).reduce((a, b) => a + b, 0)

      // [YOUTUBE] 썸네일 주입
      const imgs = Array.isArray(m.images) ? [...m.images] : []
      if (m.youtube_url) {
        const match = m.youtube_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)
        const yId = match && match[1] ? match[1] : null
        if (yId && !imgs.some((i: any) => i.youtubeUrl === m.youtube_url)) {
          imgs.unshift({
            url: m.youtube_url,
            thumbnailUrl: `https://img.youtube.com/vi/${yId}/mqdefault.jpg`,
            youtubeUrl: m.youtube_url
          })
        }
      }

      // [생각 구독] 블러 처리
      const isSubOnly = !!m.is_subscriber_only
      const isOwnContent = userObj?.id === user?.id
      const isSubscribed = subscribedCreatorIds.has(userObj?.id || '')
      const shouldBlur = isSubOnly && !isOwnContent && !isSubscribed

      const item: Record<string, any> = {
        id: userObj?.id || m.id, // 픽셀 ID
        momentId: m.id,
        author: userObj?.display_name || '익명',
        avatarUrl: userObj?.avatar_image_url || null,
        activityScore: Number(userObj?.activity_score || 0),
        country: userObj?.country || 'KR',
        personaCode: userObj?.persona?.persona_code || undefined,
        isStore: userObj?.is_store || false,
        storeRating: userObj?.store_detail?.average_rating || 4.0,
        reviewCount: userObj?.store_detail?.review_count || 0,
        moodId: userObj?.current_mood_id || undefined,
        days: days,
        createdAt: m.created_at.toISOString(),
        glowPrimary: null as string | null,
        glowSecondary: null as string | null,
        galaxyLabel: (m.contentCategory || m.category)
          ? (categories?.[viewerLang]?.[m.contentCategory || m.category] || categories?.['ko']?.[m.contentCategory || m.category] || m.contentCategory || m.category)
          : '알 수 없음',
        categoryId: m.contentCategory || m.category,
        galaxyId: m.galaxy_key,
        // [블러] 비구독자에게는 40자 절삭
        content: shouldBlur
          ? (m.content || '').substring(0, 40) + ((m.content || '').length > 40 ? '...' : '')
          : (m.content || ''),
        pings: totalPings,
        pingCount: m.ping_count || 0,
        pingTypeCounts,
        commentCount: m.comment_count || 0,
        // [블러] 비구독자에게는 이미지/유튜브 제거
        images: shouldBlur ? [] : imgs,
        youtubeUrl: shouldBlur ? null : (m.youtube_url || null),
        coord: {
          x: coordObj?.coordX || 0,
          y: coordObj?.coordY || 0,
          z: coordObj?.zDepth || 1
        },
        targetPixelId: m.target_pixel_id || null,
        targetPixelCoord: targetCoordObj ? {
          x: targetCoordObj.coordX,
          y: targetCoordObj.coordY,
          z: targetCoordObj.zDepth || 1
        } : null,
        isSubscriberOnly: isSubOnly,
        isBlurred: shouldBlur,
        blurredUserId: shouldBlur ? (userObj?.id || null) : null,
        // [Babel Feed] 번역 데이터 매핑
        originalLanguage: m.original_language || null,
        isTranslated: false as boolean,
        originalContent: null as string | null,
      }

      // 방문자 언어와 원문 언어가 다르고, 해당 번역이 존재하면 교체
      const translations = (m as any).translations || []
      if (viewerLang !== (m.original_language || 'ko') && translations.length > 0) {
        const match = translations.find((t: any) => t.locale === viewerLang)
        if (match && match.content) {
          item.originalContent = item.content
          item.content = shouldBlur
            ? match.content.substring(0, 40) + (match.content.length > 40 ? '...' : '')
            : match.content
          item.isTranslated = true
        }
      }

      return item
    })

    return NextResponse.json({
      data: mapped,
      hasMore: mapped.length === limit,
      totalCount: mapped.length // 추후 카운팅 쿼리 추가 가능
    })

  } catch (error) {
    console.error('Feed Search Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
