/**
 * [생각그래프] POST /api/thought-graph/process — AI 파이프라인 (서버 내부 호출)
 * 
 * 클라이언트는 이 API를 직접 호출하지 않음.
 * moments/route.ts POST에서 fire-and-forget으로 processThoughtGraph()를 직접 호출함.
 * 
 * 이 엔드포인트는 수동 재처리 또는 배치 처리용으로 예비 등록.
 * [1단계] 스켈레톤 — 즉시 202 반환
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { processThoughtGraph } from '@/shared/lib/thought-graph/processThoughtGraph'

export async function POST(request: Request) {
  try {
    // 인증 확인
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { momentId } = await request.json()

    if (!momentId) {
      return NextResponse.json({ error: 'momentId is required' }, { status: 400 })
    }

    // 비동기 처리 — 응답은 즉시 반환
    processThoughtGraph(momentId).catch((err) => {
      console.error('[ThoughtGraph] 수동 파이프라인 오류:', err)
    })

    return NextResponse.json({ success: true, message: 'Processing started' }, { status: 202 })
  } catch (error) {
    console.error('[ThoughtGraph] POST process 오류:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
