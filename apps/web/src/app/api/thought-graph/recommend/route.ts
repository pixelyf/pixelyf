/**
 * [생각그래프] GET /api/thought-graph/recommend
 * 
 * 작성 중인 텍스트와 의미적으로 가장 연관 깊은
 * 로그인 본인의 과거 생각 Top-3를 pgvector 코사인 유사도 검색으로 조회합니다.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { resolveApiKeyByUserId } from '@/shared/lib/ai/compaction'
import { generateEmbedding } from '@/shared/lib/ai/amge/embedding'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const content = searchParams.get('content')
    const galaxyKey = searchParams.get('galaxyKey')

    if (!content || !galaxyKey) {
      return NextResponse.json({ error: 'content and galaxyKey are required' }, { status: 400 })
    }

    // 작성 중인 텍스트가 공백이거나 비어 있으면 불필요한 임베딩 API 호출 없이 조기 안전 이탈
    if (content.trim().length === 0) {
      return NextResponse.json({ recommendations: [] })
    }

    // 1. 로그인 인증 확인
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 본인의 API 키 조회 (복호화)
    const { apiKey, provider } = await resolveApiKeyByUserId(user.id)

    // 3. 실시간 768d 임베딩 추출
    const vector = await generateEmbedding(apiKey, provider, content)
    if (!vector || vector.length !== 768) {
      return NextResponse.json({ error: 'Embedding failed' }, { status: 500 })
    }

    // 4. pgvector 코사인 쿼리로 본인 과거 글 Top-3 조회
    const vectorStr = `[${vector.join(',')}]`
    const recommendations: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, content, summary
       FROM moments
       WHERE user_id = $1::uuid AND galaxy_key = $2 AND is_deleted = false AND embedding IS NOT NULL
       ORDER BY embedding <=> $3::vector ASC
       LIMIT 3`,
      user.id,
      galaxyKey,
      vectorStr
    )

    // 반환 포맷 가공 (summary 가 없으면 content 슬라이스 폴백)
    const result = recommendations.map((r: any) => ({
      id: r.id,
      content: r.content,
      summary: r.summary || (r.content ? r.content.slice(0, 15) : '과거 생각')
    }))

    return NextResponse.json({ recommendations: result })
  } catch (error: any) {
    console.error('[ThoughtGraph:Recommend] GET 오류:', error?.message || error)
    return NextResponse.json({ error: 'Internal Server Error', detail: error?.message }, { status: 500 })
  }
}
