import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { rankToZone } from '@/shared/constants/galaxy'

// ─────────────────────────────────────────────────────────────────────────────
// Zone 명칭 매핑 (batch_reposition.py 6구간과 동기화)
// ─────────────────────────────────────────────────────────────────────────────
const ZONE_NAMES: Record<number, string> = {
  1: '은하 챔피언',
  2: '초밀집 코어',
  3: '텐션 코어',
  4: '확산 시작',
  5: '광역 확산',
  6: '심우주',
}

/**
 * GET /api/users/me/evolution — 진화 상태 + 위치 스토리 데이터
 * 
 * 응답:
 * {
 *   activityScore: number,
 *   rank: number,
 *   zone: number,
 *   zoneName: string,
 *   totalUsers: number,
 *   history: Array<{ date, rank, zone, x, y }>
 * }
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. 현재 유저 데이터 (활동 점수, 좌표, rank)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('activity_score')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const activityScore = Number(userData.activity_score || 0)

    // 2. 현재 좌표 + rank 조회
    const { data: coordData } = await supabase
      .from('user_coordinates')
      .select('coord_x, coord_y, rank, galaxy_key')
      .eq('user_id', user.id)
      .order('galaxy_key', { ascending: true })
      .limit(1)
      .maybeSingle()

    const currentRank = coordData?.rank ?? null

    // 3. 전체 활성 유저 수 (rank 계산용 분모)
    const { count: totalUsers } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_shadow_banned', false)

    // 4. rank가 없는 경우 (마이그레이션 전) activity_score 기반 상대 순위 추정
    let rank = currentRank
    if (rank === null) {
      // activity_score가 나보다 높은 유저 수 = 내 순위 - 1
      const { count: higherCount } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_shadow_banned', false)
        .gt('activity_score', activityScore)

      rank = (higherCount ?? 0) + 1
    }

    const zone = rankToZone(rank)
    const zoneName = ZONE_NAMES[zone] || '미정'

    // 5. 좌표 히스토리 조회 (coordinate_history 테이블, 최근 30일)
    let history: Array<{ date: string; rank: number; zone: number; x: number; y: number }> = []

    try {
      const { data: historyData } = await supabase
        .from('coordinate_history')
        .select('snapshot_date, rank, zone, coord_x, coord_y')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: false })
        .limit(30)

      if (historyData && historyData.length > 0) {
        history = historyData.map(h => ({
          date: h.snapshot_date,
          rank: h.rank,
          zone: h.zone,
          x: h.coord_x,
          y: h.coord_y,
        }))
      }
    } catch {
      // coordinate_history 테이블이 아직 없는 경우 무시 (마이그레이션 전)
    }

    return NextResponse.json({
      activityScore,
      rank,
      zone,
      zoneName,
      totalUsers: totalUsers ?? 0,
      history,
    })
  } catch (error) {
    console.error('[Evolution API] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
