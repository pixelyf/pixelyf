import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { TOUCH_COOLDOWN_SECONDS, TOUCH_GLOW_BOOST } from '@/shared/constants/touches'
import { sendNotification } from '@/shared/services/notificationService'

export const dynamic = 'force-dynamic'

/**
 * POST /api/touches — 터치 전송
 * 유저→유저 경량 관심 신호 (피드 유무 무관)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { touchedId, galaxyKey } = await request.json()

    // 입력 검증
    if (!touchedId || typeof touchedId !== 'string') {
      return NextResponse.json({ error: 'touchedId is required' }, { status: 400 })
    }

    // 자기 터치 방어
    if (touchedId === user.id) {
      return NextResponse.json({ error: 'Cannot touch yourself' }, { status: 400 })
    }

    // 대상 존재 확인
    const target = await prisma.user.findUnique({
      where: { id: touchedId },
      select: { id: true, display_name: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    // 쿨다운: 동일 toucher→touched 간 12시간 이내 중복 차단 (touches.ts의 12시간 상수와 자동 연동)
    const cooldownAgo = new Date(Date.now() - TOUCH_COOLDOWN_SECONDS * 1000).toISOString()
    const { data: recentTouches } = await supabase
      .from('touches')
      .select('id')
      .eq('toucher_id', user.id)
      .eq('touched_id', touchedId)
      .gte('created_at', cooldownAgo)
      .limit(1)

    if (recentTouches && recentTouches.length > 0) {
      return NextResponse.json({ error: '잠시 후 다시 터치해주세요. (12시간 쿨다운)' }, { status: 429 })
    }

    // 터치 삽입 (PostgREST 권한 이슈 우회를 위해 Prisma 사용)
    try {
      await prisma.touches.create({
        data: {
          toucher_id: user.id,
          touched_id: touchedId,
          galaxy_key: galaxyKey || null,
        }
      })
    } catch (insertError) {
      console.error('[Touch] Insert Error:', insertError)
      return NextResponse.json({ error: 'Failed to send touch' }, { status: 500 })
    }


    // [EVOLUTION] 진화 점수 즉시 증분 (터치 수신자 +1)
    // 전역 레거시 RPC (하위 호환) + 은하별 독립 RPC
    const rpcCalls: PromiseLike<any>[] = [
      supabase.rpc('increment_activity_score', { user_id_param: touchedId, amount: 1 }),
    ]
    if (galaxyKey) {
      rpcCalls.push(
        supabase.rpc('increment_galaxy_activity_score', {
          user_id_param: touchedId,
          galaxy_key_param: galaxyKey,
          amount: 1,
        })
      )
    }
    await Promise.all(rpcCalls)


    // Realtime broadcast → 수신자에게 터치 알림
    const { data: senderData } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single()

    const channelName = `user-touch-${touchedId}`
    const touchChannel = supabase.channel(channelName)
    await touchChannel.send({
      type: 'broadcast',
      event: 'new-touch',
      payload: {
        toucher_name: senderData?.display_name || '누군가',
        toucher_id: user.id,
      },
    })
    await supabase.removeChannel(touchChannel)

    // [알림 DB+Push] 터치 수신 알림 — 알림 실패가 터치 실패로 이어지면 안 됨
    try {
      await sendNotification({
        userId: touchedId,
        type: 'TOUCH',
        title: `${senderData?.display_name || '누군가'}님이 터치했습니다`,
        body: '당신의 픽셀에 따뜻한 관심이 도착했습니다.',
        link: `/?pixel=${touchedId}`,
        actorId: user.id,
      })
    } catch (notifError) {
      console.error('[Touch] Notification failed (non-critical):', notifError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Touch] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * GET /api/touches — 터치 통계 조회
 * ?userId=XXX → 해당 유저의 받은 터치 수 (PixelDetailDrawer lazy-load 용)
 * 파라미터 없음 → 내 통계 (보낸/받은 + 최근 히스토리)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const targetUserId = url.searchParams.get('userId')
    const galaxyKey = url.searchParams.get('galaxy')

    const supabase = await createClient()

    // 특정 유저의 받은 터치 수만 조회 (Drawer lazy-load 용, 로그인 불필요)
    if (targetUserId) {
      let query = supabase
        .from('touches')
        .select('id', { count: 'exact', head: true })
        .eq('touched_id', targetUserId)
        
      if (galaxyKey) {
        query = query.eq('galaxy_key', galaxyKey)
      }

      const { count } = await query
      return NextResponse.json({ touchCount: count || 0 })
    }

    // 내 통계는 로그인 필수
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 내 통계: 보낸/받은 총 카운트
    let sentQuery = supabase
      .from('touches')
      .select('id', { count: 'exact', head: true })
      .eq('toucher_id', user.id)
      
    if (galaxyKey) {
      sentQuery = sentQuery.eq('galaxy_key', galaxyKey)
    }

    let receivedQuery = supabase
      .from('touches')
      .select('id', { count: 'exact', head: true })
      .eq('touched_id', user.id)
      
    if (galaxyKey) {
      receivedQuery = receivedQuery.eq('galaxy_key', galaxyKey)
    }

    const [sentResult, receivedResult] = await Promise.all([sentQuery, receivedQuery])

    // 최근 받은 터치 히스토리 (30건)
    let recentQuery = supabase
      .from('touches')
      .select('id, toucher_id, created_at')
      .eq('touched_id', user.id)
      
    if (galaxyKey) {
      recentQuery = recentQuery.eq('galaxy_key', galaxyKey)
    }

    const { data: recentTouches } = await recentQuery
      .order('created_at', { ascending: false })
      .limit(30)

    // 상대방 정보 일괄 조회 (N+1 방지)
    const toucherIds = [...new Set((recentTouches || []).map(t => t.toucher_id))]
    const { data: touchers } = await supabase
      .from('users')
      .select('id, display_name, pixel_id')
      .in('id', toucherIds.length > 0 ? toucherIds : ['00000000-0000-0000-0000-000000000000'])

    const toucherMap = new Map((touchers || []).map(u => [u.id, u]))

    return NextResponse.json({
      stats: {
        totalSent: sentResult.count || 0,
        totalReceived: receivedResult.count || 0,
      },
      recentTouches: (recentTouches || []).map(t => ({
        id: t.id,
        createdAt: t.created_at,
        toucher: {
          id: t.toucher_id,
          displayName: toucherMap.get(t.toucher_id)?.display_name || '알 수 없는 별',
          pixelId: toucherMap.get(t.toucher_id)?.pixel_id || null,
        },
      })),
    })
  } catch (error) {
    console.error('[Touch Stats] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
