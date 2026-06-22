/**
 * [생각그래프] POST /api/thought-graph/backfill — 2-hop 백필 배치 실행
 * 
 * 수동 API 호출 전용 엔드포인트.
 * 인증 방식: 관리자 로그인 세션 또는 BACKFILL_SECRET 환경변수
 * 
 * 사용법:
 *   curl -X POST http://localhost:3000/api/thought-graph/backfill \
 *     -H "Content-Type: application/json" \
 *     -H "x-backfill-secret: <BACKFILL_SECRET>"
 * 
 * 또는 로그인 세션 쿠키로 호출 가능.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { backfillThoughtGraph } from '@/shared/lib/thought-graph/backfillThoughtGraph'

export async function POST(request: Request) {
  try {
    // 인증 방식 1: BACKFILL_SECRET 환경변수 (Cron/시스템 호출용)
    const secretHeader = request.headers.get('x-backfill-secret')
    const envSecret = process.env.BACKFILL_SECRET

    let userId: string | null = null

    if (envSecret && secretHeader === envSecret) {
      // 시스템 호출 — 환경변수에서 관리자 user_id를 가져옴
      userId = process.env.BACKFILL_ADMIN_USER_ID || null
      if (!userId) {
        return NextResponse.json(
          { error: 'BACKFILL_ADMIN_USER_ID 환경변수가 설정되지 않았습니다' },
          { status: 500 }
        )
      }
    } else {
      // 인증 방식 2: 로그인 세션 (관리자 수동 호출용)
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      userId = user.id
    }

    // 동기 실행 — 결과를 응답에 포함하기 위해 await로 완료 대기
    const startTime = Date.now()
    const stats = await backfillThoughtGraph(userId)

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: 'Backfill completed',
      stats: {
        candidatesFound: stats.candidatesFound,
        relationshipsCreated: stats.relationshipsCreated,
        llmCallsMade: stats.llmCallsMade,
        durationMs: duration,
      },
    })
  } catch (error: any) {
    console.error('[Backfill] API 오류:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', detail: error?.message },
      { status: 500 }
    )
  }
}
