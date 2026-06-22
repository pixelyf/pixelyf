import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { inngest } from '@/lib/inngest'
import prisma from '@/shared/lib/prisma'
import { getMoodColors } from '@/shared/constants/moods'
import { processThoughtGraph } from '@/shared/lib/thought-graph/processThoughtGraph'
import { getReflectionMetadata } from '@/shared/lib/ai/memoryPolicy'
import { buildMemoryWritePlan } from '@/shared/lib/ai/memoryWriteGate'
import { isTranslationSkipped } from '@/shared/lib/ai/babelGuard'
import { recordMemoryTrace } from '@/shared/lib/ai/memoryTrace'
import { SUPPORTED_LOCALES } from '@/i18n/routing'
import { isValidCategory } from '@/shared/config/contentCategories'

// [생각 구독] 비구독자에게 보여줄 미리보기 글자 수
const PREVIEW_CHAR_LIMIT = 40

// MOOD to AURA Mapping (30 Moods -> 8 Design Auras)
// Corrected to match Prisma schema and Database enums
const MOOD_TO_AURA: Record<string, string> = {
  // 1. 긍정 & 활기
  happy: 'ENERGY', anticipation: 'ENERGY',
  // 2. 평온 & 사랑
  love: 'CALM', peace: 'CALM', calm: 'CALM',
  // 3. 지적 & 사유
  reflection: 'DRIFT', curious: 'PASSION', determination: 'PASSION', passion: 'PASSION',
  // 4. 침잠 & 지침
  sad: 'CLOUD', tired: 'CLOUD',
  // 5. 중립
  neutral: 'GLOW',
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const targetPixelId = searchParams.get('targetPixelId')
    const category = searchParams.get('category')  // [PANEL CRUD] 은하별 피드 격리
    const galaxy = searchParams.get('galaxy')      // 3축 은하 필터
    const page = parseInt(searchParams.get('page') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const viewerLang = searchParams.get('lang') || 'ko'

    if (!userId && !targetPixelId) {
      return NextResponse.json({ error: 'userId or targetPixelId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // [PANEL CRUD] 페이지네이션 + 은하별 필터 지원
    // [PING FIX] 해당 모먼트의 고유 핑 갯수(ping_count) 컬럼을 원자적 증분값으로 신뢰하여 그대로 사용합니다.
    let query = supabase
      .from('moments')
      .select('*', { count: 'exact' })  // 총 건수 포함 (무한 스크롤 hasMore 판단용)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (targetPixelId) {
      query = query.eq('target_pixel_id', targetPixelId)
    } else {
      query = query.eq('user_id', userId).is('target_pixel_id', null)
    }

    // 은하별 피드 격리: galaxy_key로 정확하게 필터링
    if (galaxy) {
      query = query.eq('galaxy_key', galaxy)
    }

    if (category) {
      query = query.eq('content_category', category)
    }

    // 1차 병렬화: Supabase Auth 세션 검증 & moments 목록 조회를 동시에 실행
    const [authRes, momentsRes] = await Promise.all([
      supabase.auth.getUser(),
      query
    ])

    const viewerId = authRes.data?.user?.id
    const { data: moments, error, count } = momentsRes

    if (error) throw error

    let enrichedMoments = moments || []

    // [생각 구독] 구독 전용 모먼트 필터링 — 비구독자 콘텐츠 제한
    const subOnlyMoments = enrichedMoments.filter((m: any) => m.is_subscriber_only === true)
    let subscribedCreatorIds = new Set<string>()

    const allMomentIds = enrichedMoments.map((m: any) => m.id)

    // [PING TYPES] 모먼트별 타입별 핑 카운트 집계 (모든 분기에서 공통 사용)
    let pingTypeCountsMap: Record<string, Record<string, number>> = {}
    // [Babel Feed] 번역 데이터 맵
    let translationMap: Record<string, string> = {}

    // [YOUTUBE] 썸네일 주입 헬퍼 함수
    const injectYouTubeThumbnail = (m: any) => {
      const imgs = Array.isArray(m.images) ? [...m.images] : []
      if (m.youtube_url) {
        const match = m.youtube_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)
        const yId = match && match[1] ? match[1] : null
        if (yId && !imgs.some(i => i.youtubeUrl === m.youtube_url)) {
          imgs.unshift({
            url: m.youtube_url,
            thumbnailUrl: `https://img.youtube.com/vi/${yId}/mqdefault.jpg`,
            youtubeUrl: m.youtube_url
          })
        }
      }
      return imgs
    }

    // [생각 구독] 및 Babel Feed 매핑 헬퍼
    const applySubscriptionBlur = (m: any) => {
      let result = { ...m }

      // 1. [Babel Feed] 번역 교체 (블러 적용 전 원문에 번역 덮어쓰기)
      const originalLang = result.original_language || 'ko'
      result.originalLanguage = originalLang
      result.isTranslated = false
      result.originalContent = null

      if (viewerLang !== originalLang && translationMap[result.id]) {
        result.originalContent = result.content
        result.content = translationMap[result.id]
        result.isTranslated = true
        result.ownerTranslation = translationMap[result.id]
      }

      // 2. [생각 구독] 블러 처리
      if (!result.is_subscriber_only) {
        return { ...result, isSubscriberOnly: false, isBlurred: false }
      }
      // 본인은 항상 전문 열람 가능
      if (viewerId === result.user_id) {
        return { ...result, isSubscriberOnly: true, isBlurred: false }
      }
      // 구독자는 전문 열람 가능
      if (subscribedCreatorIds.has(result.user_id)) {
        return { ...result, isSubscriberOnly: true, isBlurred: false }
      }
      // 비구독자: 콘텐츠 미리보기 + 이미지 제거
      return {
        ...result,
        content: result.content ? result.content.slice(0, PREVIEW_CHAR_LIMIT) + (result.content.length > PREVIEW_CHAR_LIMIT ? '...' : '') : null,
        images: null,
        youtube_url: null,
        isSubscriberOnly: true,
        isBlurred: true,
      }
    }

    if (enrichedMoments.length > 0) {
      const creatorIds: string[] = [...new Set(subOnlyMoments.map((m: any) => m.user_id as string))]

      // 2차 병렬화: 핑 집계, 번역 데이터, 내 핑 정보, Prisma 구독 정보를 동시에 병렬 실행
      const [allMomentPingsRes, translationsRes, myPingsRes, activeSubs] = await Promise.all([
        supabase
          .from('pings')
          .select('moment_id, ping_type')
          .in('moment_id', allMomentIds)
          .not('moment_id', 'is', null),
        supabase
          .from('moment_translations')
          .select('moment_id, content')
          .in('moment_id', allMomentIds)
          .eq('locale', viewerLang)
          .eq('status', 'completed'),
        viewerId ? supabase
          .from('pings')
          .select('moment_id, ping_type')
          .eq('sender_id', viewerId)
          .in('moment_id', allMomentIds) : Promise.resolve({ data: [] }),
        (viewerId && subOnlyMoments.length > 0) ? prisma.thought_subscriptions.findMany({
          where: {
            subscriber_id: viewerId,
            creator_id: { in: creatorIds },
            status: 'active',
            expires_at: { gt: new Date() }
          },
          select: { creator_id: true }
        }) : Promise.resolve([])
      ])

      // 1. 핑 타입별 집계 매핑
      allMomentPingsRes.data?.forEach((p: any) => {
        if (p.moment_id && p.ping_type) {
          if (!pingTypeCountsMap[p.moment_id]) pingTypeCountsMap[p.moment_id] = {}
          pingTypeCountsMap[p.moment_id][p.ping_type] = (pingTypeCountsMap[p.moment_id][p.ping_type] || 0) + 1
        }
      })

      // 2. 다국어 번역 내용 매핑
      translationsRes.data?.forEach((t: any) => {
        translationMap[t.moment_id] = t.content
      })

      // 3. 구독 관계 정보 셋 주입
      if (Array.isArray(activeSubs)) {
        subscribedCreatorIds = new Set(activeSubs.map(s => s.creator_id))
      }

      // 4. 내 핑 상태 동기화 처리
      const myPings = myPingsRes.data
      if (myPings && myPings.length > 0) {
        const pingMap: Record<string, string> = {}
        myPings.forEach((p: any) => {
          if (p.moment_id) pingMap[p.moment_id] = p.ping_type
        })
        enrichedMoments = enrichedMoments.map((m: any) => {
          return {
            ...m,
            youtubeUrl: m.youtube_url || null,
            images: injectYouTubeThumbnail(m),
            my_ping_type: pingMap[m.id] || null,
            ping_type_counts: pingTypeCountsMap[m.id] || {}
          }
        })
      } else {
        enrichedMoments = enrichedMoments.map((m: any) => ({
          ...m,
          youtubeUrl: m.youtube_url || null,
          images: injectYouTubeThumbnail(m),
          my_ping_type: null,
          ping_type_counts: pingTypeCountsMap[m.id] || {}
        }))
      }
    } else {
      enrichedMoments = enrichedMoments.map((m: any) => ({
        ...m,
        youtubeUrl: m.youtube_url || null,
        images: injectYouTubeThumbnail(m),
        ping_type_counts: pingTypeCountsMap[m.id] || {}
      }))
    }
    // [생각 구독] 모든 모먼트에 구독 블러 처리 적용
    enrichedMoments = enrichedMoments.map(applySubscriptionBlur)

    const authorIds = Array.from(new Set(enrichedMoments.map((m: any) => m.user_id).filter(Boolean)));
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true,
        display_name: true,
        avatar_image_url: true,
      }
    });
    const authorMap = new Map(authors.map(u => [u.id, u]));

    enrichedMoments = enrichedMoments.map((m: any) => ({
      ...m,
      authorProfile: authorMap.get(m.user_id) ? {
        displayName: authorMap.get(m.user_id)?.display_name,
        avatarUrl: authorMap.get(m.user_id)?.avatar_image_url,
      } : null
    }));

    return NextResponse.json({
      moments: enrichedMoments,
      totalCount: count || 0,
      hasMore: (enrichedMoments.length) === limit,  // 정확히 limit만큼 왔으면 더 있을 가능성
    })
  } catch (error) {
    console.error('Fetch Moments Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      content,
      imageUrl,
      images,
      category,
      contentCategory,
      contentTags,
      topicTags,
      moodId,
      galaxy,
      youtubeUrl,
      isSubscriberOnly,
      relationships,
      targetPixelId
    } = await request.json()

    // images가 있고 imageUrl이 없는 경우 첫 번째 이미지의 썸네일을 기본 imageUrl로 설정 (하위 호환)
    const effectiveImageUrl = imageUrl || (images && images.length > 0 ? images[0].thumbnailUrl : null);

    // Validation
    const trimmedContent = content?.trim()
    if (!trimmedContent && !effectiveImageUrl && !youtubeUrl) {
      return NextResponse.json({ error: 'Content, image, or YouTube URL is required' }, { status: 400 })
    }

    if (trimmedContent && trimmedContent.length > 140) {
      return NextResponse.json({ error: 'Content exceeds 140 characters' }, { status: 400 })
    }

    // Aura Sync
    const newAura = MOOD_TO_AURA[moodId] || 'GLOW'
    const moodColors = getMoodColors(moodId)

    // 1. 유저 아우라 상태 및 Mood ID 동기화
    await supabase.from('users').update({
      current_aura: newAura,
      current_mood_id: moodId // 추가
    }).eq('id', user.id)

    // [EVOLUTION] 성격 색상(persona.glow_color_primary/secondary)은 온보딩 시 결정된 고유 정체성.
    // 무드 색상은 위의 users.current_mood_id를 통해 프론트엔드(getMoodColors)에서 처리.
    // 기존에 여기서 persona 테이블을 무드 색상으로 덮어쓰는 버그가 있었음 → 제거됨.


    const selectedContentCategory = contentCategory || category || null
    if (selectedContentCategory && !isValidCategory(selectedContentCategory)) {
      return NextResponse.json({ error: 'Invalid content category' }, { status: 400 })
    }

    // targetPixelId가 존재할 시 category = 'COMMUNITY' 강제 지정
    const finalCategory = targetPixelId ? 'COMMUNITY' : (category || null)

    // 1. Save to moments table (using Prisma client for JSONB support if possible, or Supabase)
    // Note: Supabase JS client handles JSONB automatically
    const { data: moment, error: momentError } = await supabase.from('moments').insert({
      user_id: user.id,
      content: trimmedContent || null,
      image_url: effectiveImageUrl,
      images: images || null,
      youtube_url: youtubeUrl || null,
      aura_at_post: newAura,
      mood_id: moodId, // [NEW]: 피드 작성 시점의 감정 ID 영구 보존
      category: finalCategory,
      content_category: selectedContentCategory,
      content_tags: contentTags || topicTags || [],
      galaxy_key: galaxy || null,
      topic_tags: topicTags || [],
      is_subscriber_only: isSubscriberOnly || false,
      target_pixel_id: targetPixelId || null,
    }).select().single()

    if (momentError) throw momentError

    // [생각그래프] 유저 수동 생각 연결 저장
    if (relationships && relationships.length > 0) {
      const toSave = relationships.map((r: any) => ({
        source_moment_id: moment.id,
        target_moment_id: r.targetId,
        relation_type: r.relationType,
        created_by: 'user',
        status: 'confirmed',
      }))
      await prisma.momentRelationship.createMany({
        data: toSave,
        skipDuplicates: true
      })
    }

    // 2. Update last_seen_at (Corrected column name)
    await supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)

    // [EVOLUTION] 진화 점수 즉시 증분 (모먼트 작성 +3, 콘텐츠 생산 가중치)
    // 전역 레거시 RPC (하위 호환) + 은하별 독립 RPC
    const evolutionCalls: PromiseLike<any>[] = [
      supabase.rpc('increment_activity_score', { user_id_param: user.id, amount: 3 }),
    ]
    if (galaxy) {
      evolutionCalls.push(
        supabase.rpc('increment_galaxy_activity_score', {
          user_id_param: user.id,
          galaxy_key_param: galaxy,
          amount: 3,
        })
      )
    }
    await Promise.all(evolutionCalls)

    // [Babel Feed] Inngest 워커로 번역 요청 이관 (재시도 3회 보장, 로직 단일화)
    if (trimmedContent && moment && !isTranslationSkipped(trimmedContent)) {
      try {
        const userData = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            language: true,
            feed_translation_languages: true,
            ai_provider_keys: { where: { isActive: true }, take: 1, select: { id: true } },
          },
        })

        // original_language 저장
        await supabase
          .from('moments')
          .update({ original_language: userData?.language || 'ko' })
          .eq('id', moment.id)

        const DEFAULT_LANGS = SUPPORTED_LOCALES
        if (
          userData &&
          userData.ai_provider_keys.length > 0
        ) {
          const userLangs = userData.feed_translation_languages && userData.feed_translation_languages.length > 0
            ? userData.feed_translation_languages
            : DEFAULT_LANGS

          const targetLangs = userLangs.filter(
            (lang) => lang !== (userData.language || 'ko'),
          )

          if (targetLangs.length > 0) {
            await inngest.send({
              name: 'feed/translation.requested',
              data: {
                momentId: moment.id,
                userId: user.id,
                content: trimmedContent,
                sourceLang: userData.language || 'ko',
                targetLangs,
              },
            })
            console.log(`[Babel Feed] 번역 요청 전송: momentId=${moment.id}, ${targetLangs.length}개 언어`)
          }
        } else {
          console.warn(`[Babel Feed] API 키 미보유 — 번역 스킵: momentId=${moment.id}`)
        }
      } catch (babelErr: any) {
        // 번역 요청 실패는 피드 작성 자체를 실패시키지 않음
        if (babelErr?.code === 'ECONNREFUSED' || babelErr?.cause?.code === 'ECONNREFUSED') {
          console.warn('[Babel Feed] Inngest 데브 서버가 오프라인 상태입니다. 로컬 번역 파이프라인을 작동하려면 백그라운드 터미널에서 "npx inngest-cli dev"를 실행하십시오.')
        } else {
          console.error('[Babel Feed] 번역 요청 실패 (피드는 정상 저장됨):', babelErr)
        }
      }
    } else if (trimmedContent && moment && isTranslationSkipped(trimmedContent)) {
      console.log(`[Babel Feed] 지능형 번역 가드 작동 — 번역 스킵: momentId=${moment.id}`)
    }

    // [YOUTUBE BUG FIX] 반환 시 프론트엔드 실시간 동기화를 위해 유튜브 썸네일 주입
    if (moment.youtube_url) {
      const imgs = Array.isArray(moment.images) ? [...moment.images] : []
      const match = moment.youtube_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)
      const yId = match && match[1] ? match[1] : null
      if (yId && !imgs.some(i => i.youtubeUrl === moment.youtube_url)) {
        imgs.unshift({
          url: moment.youtube_url,
          thumbnailUrl: `https://img.youtube.com/vi/${yId}/mqdefault.jpg`,
          youtubeUrl: moment.youtube_url
        })
        moment.images = imgs
      }
      moment.youtubeUrl = moment.youtube_url // SearchFeedDrawer 매핑용
    }

    // [생각그래프] 비동기 AI 파이프라인 트리거 — 응답 블로킹 없음 (fire-and-forget)
    if (moment?.id) {
      // [Matryoshka 1회 단일화] observeOwnerMoment와 processThoughtGraph가 공용으로 사용할 1536차원 임베딩 1회 사전 생성
      let fullEmbedding: number[] | null = null
      if (trimmedContent) {
        try {
          const { resolveApiKeyByUserId } = await import('@/shared/lib/ai/compaction')
          const { callEmbedding } = await import('@/shared/lib/ai/llm')
          const { apiKey, provider } = await resolveApiKeyByUserId(user.id)
          fullEmbedding = await callEmbedding(apiKey, provider, trimmedContent)
        } catch (embErr) {
          console.warn('[Moments:POST] 최적화 임베딩 사전 생성 실패 (비동기 루틴에서 개별 폴백 구동):', embErr)
        }
      }

      processThoughtGraph(moment.id, fullEmbedding).catch((err) => {
        console.error('[ThoughtGraph] 파이프라인 오류:', err)
      })

      // [Stanford Fix] 주인 피드 → 아바타 RAW/OWNER 기억 즉시 생성
      // 기존: 24시간 Reflection 배치에서 일괄 수집 (관찰 지연)
      // 수정: 관찰 즉시 기록 (Stanford 논문 원칙)
      observeOwnerMoment(user.id, moment.id, trimmedContent || '', fullEmbedding).catch((err) => {
        console.error('[OwnerObservation] 실시간 기억 주입 실패 (피드는 정상):', err)
      })
    }

    return NextResponse.json({ success: true, moment })
  } catch (error) {
    console.error('Create Moment Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ─── [Stanford Fix] 주인 피드 → 아바타 실시간 관찰 ─────────────

/**
 * 주인이 피드를 작성하면 즉시 아바타의 RAW/OWNER 기억으로 기록합니다.
 *
 * Stanford Generative Agents 원칙:
 * "관찰(Observation)은 이벤트 발생 즉시 memory stream에 기록한다."
 *
 * 기존 Reflection LIGHT 배치(24시간 주기)의 일괄 수집 → 실시간 수집으로 전환.
 * Reflection 배치는 여전히 동작하며, source 키 중복 방지로 이중 생성 없음.
 *
 * fire-and-forget 패턴: 실패해도 피드 작성 응답에 영향 없음.
 */
async function observeOwnerMoment(
  userId: string,
  momentId: string,
  content: string,
  preCalculatedEmbedding?: number[] | null,
): Promise<void> {
  try {
    // 1. 이 주인이 소유한 활성 아바타 조회
    const soul = await prisma.aiSoul.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    })
    if (!soul) return // 아바타 없으면 무시

    // 2. 중복 방지 (Reflection 배치와 동일한 source 키)
    const sourceKey = `OWNER_MOMENT:${momentId}`
    const exists = await prisma.aiMemory.findFirst({
      where: { aiSoulId: soul.id, source: sourceKey },
      select: { id: true },
    })
    if (exists) return // 이미 존재하면 스킵

    // 3. RAW/OWNER 기억 즉시 생성
    const theme = content.slice(0, 300)
    const reflectionMetadata = getReflectionMetadata('OWNER')
    const plan = buildMemoryWritePlan({
      aiSoulId: soul.id,
      memoryStream: 'OWNER',
      memoryLayer: 'RAW',
      theme,
      source: sourceKey,
      metadata: reflectionMetadata,
      policySource: 'MOMENT',
      provenance: {
        originType: 'MOMENT',
        originId: momentId,
      },
    })
    if (!plan.data) {
      await recordMemoryTrace({
        soulId: soul.id,
        stage: 'write_gate',
        traceKey: 'OWNER_MOMENT',
        status: 'blocked',
        payload: { action: plan.action, sourceKey },
      })
      return
    }

    const memory = await prisma.aiMemory.create({
      data: plan.data,
    })
    await recordMemoryTrace({
      soulId: soul.id,
      stage: 'write_gate',
      traceKey: 'OWNER_MOMENT',
      status: 'success',
      payload: { action: plan.action, memoryId: memory.id, sourceKey },
    })

    // 4. 임베딩 벡터 생성 (비동기, 실패 무시)
    try {
      const { resolveApiKey, evaluateImportance } = await import('@/shared/lib/ai/compaction')
      const { callEmbedding } = await import('@/shared/lib/ai/llm')

      const { apiKey, provider } = await resolveApiKey(soul.id)
      // [Matryoshka] 사전 연산된 임베딩이 있으면 중복 외부 API 호출을 생략함
      const vector = preCalculatedEmbedding || await callEmbedding(apiKey, provider, theme)
      if (vector && vector.length === 1536) {
        const vectorStr = `[${vector.join(',')}]`
        await prisma.$executeRawUnsafe(
          `UPDATE ai_memories SET embedding = $1::vector WHERE id = $2::uuid`,
          vectorStr,
          memory.id,
        )
      }

      // 5. Stanford 방식 importance 평가
      const importance = await evaluateImportance(apiKey, provider, theme)
      await prisma.aiMemory.update({
        where: { id: memory.id },
        data: { importanceScore: importance },
      })
    } catch (embErr) {
      console.warn('[OwnerObservation] 임베딩/중요도 부가 처리 실패 (기억은 저장됨):', embErr)
    }

    console.log(`[OwnerObservation] 주인 피드 즉시 관찰 완료: soulId=${soul.id.substring(0, 8)}, momentId=${momentId.substring(0, 8)}`)
  } catch (err) {
    console.error('[OwnerObservation] 실시간 기억 생성 실패:', err)
  }
}
