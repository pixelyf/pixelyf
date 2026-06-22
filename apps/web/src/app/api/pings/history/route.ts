import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const dirParam = url.searchParams.get('direction')
    const direction = dirParam === 'sent' ? 'sent' : 'received' // 입력 검증: 허용값 외 기본값
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 50)
    const cursor = url.searchParams.get('cursor') // 마지막 핑 ID (cursor 기반 페이지네이션)
    const galaxyKey = url.searchParams.get('galaxy')

    // 보낸 핑 or 받은 핑 조회
    const filterColumn = direction === 'sent' ? 'sender_id' : 'receiver_id'

    let query = supabase
      .from('pings')
      .select(`
        id,
        ping_type,
        is_crystal,
        created_at,
        sender_id,
        receiver_id,
        moment_id
      `)
      .eq(filterColumn, user.id)

    if (galaxyKey) {
      query = query.eq('galaxy_key', galaxyKey)
    }

    query = query.order('created_at', { ascending: false })
      .limit(limit + 1) // +1로 hasMore 판별

    // cursor 기반 페이지네이션: cursor 이전 데이터만 조회
    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: pings, error } = await query

    if (error) {
      console.error('[Ping History] Query Error:', error)
      return NextResponse.json({ error: 'Failed to fetch ping history' }, { status: 500 })
    }

    // 상대방 유저 정보 일괄 조회 (N+1 방지)
    const partnerIds = [...new Set(pings.map(p => direction === 'sent' ? p.receiver_id : p.sender_id))]
    
    const { data: partners } = await supabase
      .from('users')
      .select('id, display_name, pixel_id')
      .in('id', partnerIds.length > 0 ? partnerIds : ['00000000-0000-0000-0000-000000000000'])

    const partnerMap = new Map((partners || []).map(u => [u.id, u]))

    // [Touch/Ping 2원 체계] 모먼트 프리뷰 일괄 조회
    const momentIds = [...new Set(pings.filter(p => p.moment_id).map(p => p.moment_id as string))]
    let momentMap = new Map<string, string>()
    if (momentIds.length > 0) {
      const { data: moments } = await supabase
        .from('moments')
        .select('id, content')
        .in('id', momentIds)
      if (moments) {
        momentMap = new Map(moments.map(m => [m.id, (m.content || '').slice(0, 30)]))
      }
    }

    // +1 초과분으로 hasMore 판별
    const hasMore = pings.length > limit
    const slicedPings = hasMore ? pings.slice(0, limit) : pings
    const nextCursor = slicedPings.length > 0 ? slicedPings[slicedPings.length - 1].created_at : null

    // 유형별 통계 (현재 페이지 기준 — slicedPings 대상)
    const typeStats: Record<string, number> = {}
    slicedPings.forEach(p => {
      typeStats[p.ping_type] = (typeStats[p.ping_type] || 0) + 1
    })

    // 총 카운트 (별도 카운트 쿼리)
    let totalSentQuery = supabase
      .from('pings')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', user.id)

    if (galaxyKey) {
      totalSentQuery = totalSentQuery.eq('galaxy_key', galaxyKey)
    }

    const { count: totalSent } = await totalSentQuery

    let totalReceivedQuery = supabase
      .from('pings')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', user.id)

    if (galaxyKey) {
      totalReceivedQuery = totalReceivedQuery.eq('galaxy_key', galaxyKey)
    }

    const { count: totalReceived } = await totalReceivedQuery

    return NextResponse.json({
      pings: slicedPings.map(p => {
        const partnerId = direction === 'sent' ? p.receiver_id : p.sender_id
        const partner = partnerMap.get(partnerId)
        return {
          id: p.id,
          pingType: p.ping_type,
          isCrystal: p.is_crystal,
          createdAt: p.created_at,
          momentId: p.moment_id || null,
          momentPreview: p.moment_id ? (momentMap.get(p.moment_id) || null) : null,
          partner: {
            id: partnerId,
            displayName: partner?.display_name || '알 수 없는 별',
            pixelId: partner?.pixel_id || null,
          }
        }
      }),
      stats: {
        totalSent: totalSent || 0,
        totalReceived: totalReceived || 0,
        typeDistribution: typeStats,
      },
      hasMore,
      nextCursor,
    })
  } catch (error) {
    console.error('[Ping History] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
