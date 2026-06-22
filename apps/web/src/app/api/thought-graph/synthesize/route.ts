/**
 * [생각그래프] POST /api/thought-graph/synthesize — 지식 합성 엔진
 * 
 * Request Body:
 *   nodeIds: string[] — 합성할 생각 노드 ID 배열
 *   galaxyKey: string — 현재 은하 키
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { resolveApiKeyByUserId } from '@/shared/lib/ai/compaction'
import { callLLM } from '@/shared/lib/ai/llm'
import { COMPACTION_MODELS } from '@/shared/lib/ai/modelSelector'

export async function POST(request: Request) {
  try {
    const { nodeIds, galaxyKey } = await request.json()

    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return NextResponse.json({ error: 'nodeIds array is required' }, { status: 400 })
    }

    // 1. 인증 및 소유권 확인
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 합성 대상 모먼트 데이터 조회 (소유주 무관하게 읽기 권한 검증은 은하 키 일치 여부로 대체)
    const moments = await prisma.moment.findMany({
      where: {
        id: { in: nodeIds },
        galaxy_key: galaxyKey,
        is_deleted: false,
      },
      select: {
        id: true,
        content: true,
        summary: true,
        created_at: true,
      },
    })

    if (moments.length === 0) {
      return NextResponse.json({ error: 'No valid moments found to synthesize' }, { status: 404 })
    }

    // 3. 노드 간 관계선(MomentRelationship) 조회 → 논리 연결망 복원
    const relationships = await prisma.momentRelationship.findMany({
      where: {
        status: 'confirmed',
        source_moment_id: { in: nodeIds },
        target_moment_id: { in: nodeIds },
      },
      select: {
        source_moment_id: true,
        target_moment_id: true,
        relation_type: true,
      },
    })

    // 4. AI API 키 확보 (사용자의 복호화된 개인 키)
    const { apiKey, provider } = await resolveApiKeyByUserId(user.id)
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API Key is not configured. Please register it in Settings.' }, { status: 400 })
    }

    // 5. LLM 지식 합성 프롬프트 조립
    const relationLabels: Record<string, string> = {
      extends: '확장/심화',
      supports: '지지/뒷받침',
      contradicts: '모순/대립',
      refines: '보완/정제',
      instantiates: '구체적 사례',
      requires: '전제조건',
      'triggered-by': '원인/유발',
    }

    const contextThoughts = moments
      .map((m, i) => `[생각 #${i + 1}] (ID: ${m.id})\n요약: ${m.summary || '없음'}\n본문: ${m.content || '없음'}`)
      .join('\n\n')

    const contextRelations = relationships.length > 0
      ? relationships
          .map(r => {
            const srcIdx = moments.findIndex(m => m.id === r.source_moment_id) + 1
            const tgtIdx = moments.findIndex(m => m.id === r.target_moment_id) + 1
            const typeLabel = relationLabels[r.relation_type] || r.relation_type
            return `- [생각 #${srcIdx}]은 [생각 #${tgtIdx}]의 "${typeLabel}" 관계입니다.`
          })
          .join('\n')
      : '연결선 정보 없음 (개별 독립 생각 군집)'

    const systemPrompt = `당신은 사용자의 파편화된 다중 생각들을 논리적이고 조화로운 한 편의 글(에세이)로 엮어내는 지식 합성 엔진(Knowledge Synthesis Engine)입니다.
반드시 아래의 작성 지침을 충실하게 준수하세요.

[지침]
1. 입력된 개별 생각들의 내용과 그 사이의 연결 구조(논리 관계선)를 면밀하게 분석하라.
2. 각각의 생각들이 단편적으로 나열되지 않게 유기적인 흐름(서론-본론-결론 구조 또는 인과적 맥락)을 완성하라.
3. 관계 정보(확장, 지지, 모순, 사례 등)를 논리 전개에 정확하게 반영하여 결속력을 높여라.
4. 사용자의 원래 문체와 톤앤매너를 훼손하지 않고 세련되게 정제된 에세이 또는 짧은 인사이트 노트를 지어라.
5. 마크다운 포맷(### 소제목, 본문 강조 등)을 가볍게 섞어 가독성을 확보하되, 마크다운 외의 번잡한 안내 메세지나 인사말은 100% 생략하고 '오직 최종 에세이 본문'만 반환하라.`

    const userPrompt = `### 합성할 생각 노드 리스트:
${contextThoughts}

### 생각들 간의 연결 관계:
${contextRelations}

이 생각들을 토대로 깊이 있는 한 편의 인사이트 글을 지어주세요.`

    const synthesisModel = COMPACTION_MODELS[provider]
    const llmResponse = await callLLM({
      apiKey,
      provider,
      model: synthesisModel,
      systemPrompt,
      userPrompt,
      responseFormat: 'text',
      temperature: 0.5,
      maxOutputTokens: 2000,
    })

    return NextResponse.json({
      content: llmResponse.content.trim(),
      citedNodes: moments.map(m => ({ id: m.id, summary: m.summary })),
    })
  } catch (error: any) {
    console.error('[ThoughtGraph:Synthesize] 지식 합성 API 오류:', error)
    return NextResponse.json({ error: 'Internal Server Error', detail: error?.message }, { status: 500 })
  }
}
