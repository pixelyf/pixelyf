/**
 * [생각그래프] AI 파이프라인 — 서버 사이드 비동기 후처리
 * 
 * 모먼트 작성 후 비동기(fire-and-forget)로 호출되어:
 * 1. resolveApiKeyByUserId로 활성 API 키를 복호화 확보
 * 2. 768d 시맨틱 임베딩 생성 → Moment.embedding pgvector 저장 (Unsupported vector)
 * 3. Gemini 2.5 Flash를 사용해 15자 한국어 요약 생성 → Moment.summary 저장
 * 4. pgvector 코사인 검색으로 동일 은하 내 유사 모먼트 후보 5개 추출
 * 5. Gemini 2.5 Flash로 후보들과의 관계(extends, supports, contradicts 등 7종) 및 확신도(Confidence) 추론
 * 6. Confidence 3단계 필터링 (>=0.7 confirmed, 0.4~0.7 pending, 0.25~0.4 near-miss) 후 MomentRelationship DB 저장
 * 7. Supabase Realtime broadcast 채널을 통한 실시간 푸시
 */

import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import { resolveApiKeyByUserId } from '@/shared/lib/ai/compaction'
import { generateEmbedding } from '@/shared/lib/ai/amge/embedding'
import { callLLM } from '@/shared/lib/ai/llm'
import { COMPACTION_MODELS } from '@/shared/lib/ai/modelSelector'
import { CONFIDENCE_THRESHOLDS } from '@/shared/lib/thought-graph/types'
import crypto from 'crypto'

/**
 * 생각그래프 AI 파이프라인 메인 함수
 * 
 * @param momentId - 새로 작성된 모먼트 ID (UUID)
 * @returns void — fire-and-forget, 응답 블로킹 없음
 */
export async function processThoughtGraph(momentId: string, fullEmbedding?: number[] | null): Promise<void> {
  try {
    // 0. 대상 모먼트 조회
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
      select: {
        id: true,
        user_id: true,
        content: true,
        galaxy_key: true,
        is_deleted: true,
      },
    })

    if (!moment || moment.is_deleted || !moment.content) {
      console.log(`[ThoughtGraph] 스킵: momentId=${momentId} (삭제됨 또는 본문 없음)`)
      return
    }

    // 1. API 키 조회 (사용자 설정 화면에서 등록한 AiProviderKey 복호화)
    const { apiKey, provider } = await resolveApiKeyByUserId(moment.user_id)

    // 2. 768d 임베딩 생성 + pgvector DB 저장
    // [Matryoshka] 전달받은 1536d fullEmbedding이 있으면 slice(0, 768)로 변환해 외부 API 호출을 생략함
    const vector = fullEmbedding
      ? fullEmbedding.slice(0, 768)
      : await generateEmbedding(apiKey, provider, moment.content)

    if (!vector || vector.length !== 768) {
      console.error(`[ThoughtGraph] 임베딩 생성 실패 (768d 아님): momentId=${momentId}`)
      return
    }

    const vectorStr = `[${vector.join(',')}]`
    await prisma.$executeRawUnsafe(
      `UPDATE moments SET embedding = $1::vector WHERE id = $2::uuid`,
      vectorStr,
      momentId
    )

    // 3. 15자 원본 언어 자동 요약 생성 (Gemini Flash) + DB 저장
    const summaryModel = COMPACTION_MODELS[provider]
    const summaryResult = await callLLM({
      apiKey,
      provider,
      model: summaryModel,
      systemPrompt: '당신은 생각 요약 전문가입니다. 주어진 생각의 핵심을 원본 언어(한국어, 영어, 일본어 등 원본 텍스트와 동일한 언어)로 15자 이내(영어나 알파벳의 경우 3~4단어 이내)로 명사형 요약하세요. 반드시 지켜야 할 규칙: 1) 대명사(그것, 이것, 그녀, 이 방법 등)나 지시어를 절대 사용하지 말고, 원문에서 지시하는 구체적 명사로 치환하라. 2) 요약만 단독으로 읽어도 주제가 완벽히 파악되는 자기완결적 명사구를 생성하라. 이모지 사용 금지, 결과만 한 줄로 출력하세요.',
      userPrompt: `글: "${moment.content}"`,
      responseFormat: 'text',
      temperature: 0.2,
      maxOutputTokens: 30,
    })
    
    const summary = summaryResult.content.trim()
    const finalSummary = summary.length > 15 ? summary.slice(0, 15) : summary
    await prisma.moment.update({
      where: { id: momentId },
      data: { summary: finalSummary }
    })

    // 4. pgvector 코사인 검색 → 동일 은하 내 후보 5개 추출
    // [HNSW 튜닝] 유사 생각 검색의 재현율 확보를 위해 세션 레벨 ef_search 설정 부여
    // Prisma 커넥션 풀 환경에서 동일 커넥션을 보장받아 세션 튜닝이 작동하도록 $transaction으로 순차 실행
    const [_, candidates] = await prisma.$transaction([
      prisma.$executeRawUnsafe('SET hnsw.ef_search = 40;'),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, content, summary, user_id
         FROM moments
         WHERE galaxy_key = $1 AND is_deleted = false AND id != $2 AND embedding IS NOT NULL
         ORDER BY embedding <=> $3::vector ASC
         LIMIT 5`,
        moment.galaxy_key,
        momentId,
        vectorStr
      )
    ])

    if (candidates.length === 0) {
      console.log(`[ThoughtGraph] 후보 글 없음 (유사생각 매칭 생략): momentId=${momentId}`)
      return
    }

    // 5. Gemini 관계 추론 (JSON Mode)
    const relationPrompt = `
당신은 지식 그래프 논리 관계 추론 엔진입니다.
신규 작성된 생각(New Moment)과 과거의 연관 후보 생각(Past Candidates)을 분석하여, 의미론적 인과 관계를 추론하고 연결선(Edge)을 정의해 주세요.

[신규 작성된 생각]
본문: "${moment.content}"

[과거 후보 생각들]
${candidates.map((c, i) => `${i + 1}. ID: "${c.id}" | 본문: "${c.content}"`).join('\n')}

아래의 관계 유형 정의를 따르십시오:
- "extends": 신규 생각이 과거 생각을 더 확장하고 깊은 논리로 발전시킴.
- "supports": 신규 생각이 과거 생각을 뒷받침하거나 옹호함.
- "contradicts": 두 생각이 서로 대립되거나 모순됨.
- "refines": 과거 생각을 더 정교하게 다듬거나 한계를 보완함.
- "instantiates": 신규 생각이 과거 생각에 대한 구체적인 예시나 경험담을 제시함.
- "requires": 신규 생각을 이해하기 위해 과거의 생각이 전제 조건으로 반드시 필요함.
- "triggered-by": 과거의 생각이나 사건이 원인이 되어 신규 생각이 유발됨.

반드시 아래의 JSON 포맷 스키마로만 응답하십시오. 다른 설명 텍스트는 절대 포함하지 마십시오:
{
  "relationships": [
    {
      "target_moment_id": "과거 생각 ID",
      "relation_type": "extends | supports | contradicts | refines | instantiates | requires | triggered-by",
      "confidence": 0.0~1.0
    }
  ]
}
`

    const relationModel = COMPACTION_MODELS[provider]
    const relationResult = await callLLM({
      apiKey,
      provider,
      model: relationModel,
      systemPrompt: '당신은 지식 그래프 관계 추론가입니다. 반드시 지시된 JSON 스키마를 100% 엄수해 결과만 출력하세요.',
      userPrompt: relationPrompt,
      responseFormat: 'json',
      temperature: 0.1,
      maxOutputTokens: 1000,
    })

    // [FIX #5] JSON.parse 에러 핸들링 — LLM이 JSON 외 텍스트를 반환하는 경우 대비
    let relationships: any[] = []
    try {
      const parsed = JSON.parse(relationResult.content)
      relationships = parsed.relationships || []
    } catch {
      console.warn(`[ThoughtGraph] LLM JSON 파싱 실패 (관계 생성 생략): momentId=${momentId}`)
      return
    }

    // 6. Confidence 3단계 필터링 및 MomentRelationship DB 저장
    // [FIX #7] CONFIDENCE_THRESHOLDS.NEAR_MISS_MIN(0.25) 이상을 저장하여 near-miss 타입 활성화
    // >=0.7: confirmed / 0.4~0.7: pending / 0.25~0.4: near-miss (relation_type 강제 지정)
    const toSave = relationships
      .filter((r: any) => r.confidence >= CONFIDENCE_THRESHOLDS.NEAR_MISS_MIN)
      .map((r: any) => ({
        id: crypto.randomUUID(),  // [FIX] PostgreSQL createMany에서 반환 안되는 UUID를 수동 생성해 주입 (토스트 ID 연동용)
        source_moment_id: momentId,
        target_moment_id: r.target_moment_id,
        relation_type: r.confidence < CONFIDENCE_THRESHOLDS.TOAST_MIN
          ? 'near-miss'           // 0.25~0.4: near-miss 타입으로 분류
          : r.relation_type,      // 0.4 이상: LLM이 추론한 원래 관계 유형 사용
        weight: r.confidence,
        status: r.confidence >= CONFIDENCE_THRESHOLDS.AUTO_CONFIRM
          ? 'confirmed'
          : r.confidence >= CONFIDENCE_THRESHOLDS.TOAST_MIN
            ? 'pending'
            : 'near-miss',
        created_by: 'ai',         // [FIX] 명세서 규격에 의거한 생성 주체 명시 주입
      }))

    if (toSave.length > 0) {
      // DB 저장 (중복 방지)
      await prisma.momentRelationship.createMany({
        data: toSave,
        skipDuplicates: true
      })

      // 7. Supabase Realtime broadcast 실시간 푸시
      const supabase = await createClient()
      const channel = supabase.channel(`thought-graph:${moment.galaxy_key}`)
      await channel.send({
        type: 'broadcast',
        event: 'new-relationship',
        payload: {
          momentId,
          summary: finalSummary,
          relationships: toSave.map((r: any) => {
            const targetCandidate = candidates.find(c => c.id === r.target_moment_id)
            return {
              id: r.id, // 생성된 관계 UUID를 토스트 PATCH 조작용으로 제공
              targetMomentId: r.target_moment_id,
              targetSummary: targetCandidate?.summary || '', // [FIX] 토스트에 표시할 타겟 글 서머리 주입
              relationType: r.relation_type,
              weight: r.weight,
              confidence: r.weight,
              status: r.status, // 클라이언트 필터링용 상태 제공
            }
          })
        }
      })
      await supabase.removeChannel(channel)
    }

    console.log(`[ThoughtGraph] AI 파이프라인 연산 및 실시간 동기화 완료: momentId=${momentId}, 저장된 관계 수=${toSave.length}`)
  } catch (error) {
    console.error(`[ThoughtGraph] 파이프라인 처리 오류: momentId=${momentId}`, error)
  }
}
