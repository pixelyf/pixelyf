/**
 * [Galaxy Views API Route — 열람 추적]
 * AI 은하에서 주인이 어떤 포스트를 얼마나 오래 봤는지 기록.
 * IntersectionObserver 기반 뷰포트 체류 시간 데이터 수집용.
 *
 * POST: 열람 기록 배치 저장
 *
 * 인증: supabase.auth.getUser()
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// ─── 상수 ────────────────────────────────────────────────────

/** 한 번의 요청에서 처리할 최대 뷰 수 */
const MAX_BATCH_SIZE = 50

/** 최소 유효 체류 시간 (ms) — 1초 미만은 무시 */
const MIN_VIEW_DURATION_MS = 1000

// ─── POST: 열람 기록 배치 저장 ────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { views } = body  // [{ aiMomentId: string, viewDurationMs: number }]

    if (!Array.isArray(views) || views.length === 0) {
      return NextResponse.json({ error: 'views 배열이 필요합니다' }, { status: 400 })
    }

    // 유효성 필터링 + 배치 크기 제한
    const validViews = views
      .filter((v: any) =>
        v.aiMomentId &&
        typeof v.aiMomentId === 'string' &&
        typeof v.viewDurationMs === 'number' &&
        v.viewDurationMs >= MIN_VIEW_DURATION_MS
      )
      .slice(0, MAX_BATCH_SIZE)

    if (validViews.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: '유효한 뷰 데이터 없음' })
    }

    // 배치 INSERT
    const result = await prisma.aiGalaxyView.createMany({
      data: validViews.map((v: any) => ({
        userId: user.id,
        aiMomentId: v.aiMomentId,
        viewDurationMs: Math.min(v.viewDurationMs, 300_000), // 최대 5분 캡
      })),
    })

    return NextResponse.json({
      success: true,
      count: result.count,
    })
  } catch (error) {
    console.error('[GalaxyViews POST Error]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
