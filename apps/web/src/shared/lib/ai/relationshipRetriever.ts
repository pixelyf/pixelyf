import prisma from '../prisma.ts'
import { callLLM } from './llm.ts'
import { generateEmbedding } from './amge/embedding.ts'
import { COMPACTION_MODELS } from './modelSelector.ts'
import type { AiProvider } from './provider'

export type RelationshipIntent = {
  isRelationshipQuery: boolean
  targetConcept: string | null
  relationType: 'extends' | 'supports' | 'contradicts' | 'refines' | 'instantiates' | 'requires' | 'triggered-by' | 'any' | null
}

export type RelatedMomentResult = {
  id: string
  content: string | null
  summary: string | null
  createdAt: Date
  relationType: string
  weight: number
}

// Fast-path 정규식 필터: 대화 발화가 관계 탐색 키워드를 가지고 있는지 1차 스크리닝
const RELATION_KEYWORDS_REGEX = /(반대|대립|모순|이전|연관|유래|생각|예시|경험|전제|원인|유발|extends|supports|contradicts|refines|instantiates|requires|triggered)/i

/**
 * 1. 사용자 대화 발화에서 시맨틱 관계 탐색 의도가 존재하는지 감지합니다.
 */
export async function detectRelationshipIntent(
  queryText: string,
  apiKey: string,
  provider: AiProvider
): Promise<RelationshipIntent> {
  const normalized = queryText.trim()
  if (!normalized) {
    return { isRelationshipQuery: false, targetConcept: null, relationType: null }
  }

  // Fast-path: 키워드가 아예 없는 일상 대화는 즉시 스킵 (0.1ms)
  if (!RELATION_KEYWORDS_REGEX.test(normalized)) {
    return { isRelationshipQuery: false, targetConcept: null, relationType: null }
  }

  try {
    const model = COMPACTION_MODELS[provider]
    const systemPrompt = `당신은 사용자의 질문에서 생각 간의 관계형 질의 의도를 파악하는 엔진입니다.
질문이 과거의 생각, 과거 글, 이전 행동 간의 특정한 논리적 관계(반대되는 생각, 지원하는 생각, 보완하는 생각 등)를 묻고 있는지 판별하세요.

관계형 질문이 맞다면, 질문에서 찾고자 하는 시맨틱 대상 키워드(targetConcept)와 원하는 관계 유형(relationType)을 JSON 형태로 응답하세요.

관계 유형 목록:
- "extends": 생각을 더 확장하고 발전시킨 내용 탐색
- "supports": 생각을 지지/옹호하는 내용 탐색
- "contradicts": 대립/반대/모순되는 내용 탐색
- "refines": 더 다듬거나 보완한 내용 탐색
- "instantiates": 구체적인 예시나 경험담 탐색
- "requires": 전제 조건이 되는 내용 탐색
- "triggered-by": 원인이 되어 유발된 내용 탐색
- "any": 특정 유형에 국한되지 않고 관련되어 있는 모든 생각 탐색

반드시 아래의 JSON 포맷 스키마로만 결과만 응답하고 다른 텍스트는 절대 포함하지 마십시오:
{
  "isRelationshipQuery": true/false,
  "targetConcept": "질문에서 지목하는 대상 생각의 핵심 키워드 1단어 또는 null",
  "relationType": "extends | supports | contradicts | refines | instantiates | requires | triggered-by | any | null"
}`

    const result = await callLLM({
      apiKey,
      provider,
      model,
      systemPrompt,
      userPrompt: `질문: "${normalized}"`,
      responseFormat: 'json',
      temperature: 0.1,
      maxOutputTokens: 150,
      thinkingBudget: 0
    })

    const parsed = JSON.parse(result.content.trim())
    return {
      isRelationshipQuery: Boolean(parsed.isRelationshipQuery),
      targetConcept: parsed.targetConcept || null,
      relationType: parsed.relationType || null,
    }
  } catch (err) {
    console.error('[RelationshipRetriever] 의도 판별 실패:', err)
    return { isRelationshipQuery: false, targetConcept: null, relationType: null }
  }
}

/**
 * 2. 감지된 관계형 의도를 바탕으로 PostgreSQL pgvector와 moment_relationships를 조인해 연관 모먼트를 소환합니다.
 */
export async function retrieveRelatedMoments(
  ownerUserId: string,
  intent: RelationshipIntent,
  apiKey: string,
  provider: AiProvider
): Promise<{ baseMoment: { summary: string | null; content: string | null } | null; related: RelatedMomentResult[] }> {
  const { targetConcept, relationType } = intent
  if (!targetConcept) {
    return { baseMoment: null, related: [] }
  }

  try {
    // 1단계: targetConcept의 768차원 임베딩 생성 (Matryoshka)
    const embedding = await generateEmbedding(apiKey, provider, targetConcept)
    if (!embedding || embedding.length !== 768) {
      console.warn('[RelationshipRetriever] 768d 임베딩 생성 실패')
      return { baseMoment: null, related: [] }
    }

    const vectorStr = `[${embedding.join(',')}]`

    // 2단계: pgvector 코사인 거리가 가장 가까운 유저의 기준 모먼트 1개 획득
    const baseMoments = await prisma.$queryRawUnsafe<Array<{ id: string; content: string | null; summary: string | null }>>(
      `SELECT id, content, summary
       FROM moments
       WHERE user_id = $1::uuid AND is_deleted = false AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector ASC
       LIMIT 1`,
      ownerUserId,
      vectorStr
    )

    if (baseMoments.length === 0) {
      return { baseMoment: null, related: [] }
    }

    const baseMoment = baseMoments[0]

    // 3단계: moment_relationships 1-Hop 조인하여 연관 엣지 획득
    // status가 'confirmed'이고 relation_type이 부합하는 엣지 조회 (최대 10개 세이프가드)
    const relClause = relationType && relationType !== 'any'
      ? `AND relation_type = $2`
      : ''
    const relParams = relationType && relationType !== 'any' ? [baseMoment.id, relationType] : [baseMoment.id]

    const edges = await prisma.$queryRawUnsafe<Array<{ related_id: string; relation_type: string; weight: number }>>(
      `SELECT 
         CASE WHEN source_moment_id = $1::uuid THEN target_moment_id ELSE source_moment_id END AS related_id,
         relation_type,
         weight
       FROM moment_relationships
       WHERE (source_moment_id = $1::uuid OR target_moment_id = $1::uuid)
         AND status = 'confirmed'
         ${relClause}
       ORDER BY weight DESC, created_at DESC
       LIMIT 10`,
      ...relParams
    )

    if (edges.length === 0) {
      return { baseMoment: { summary: baseMoment.summary, content: baseMoment.content }, related: [] }
    }

    // 4단계: 연관된 모먼트들의 내용 병렬 조회
    const relatedIds = edges.map(e => e.related_id)
    const moments = await prisma.moment.findMany({
      where: { id: { in: relatedIds }, is_deleted: false },
      select: { id: true, content: true, summary: true, created_at: true }
    })

    const results: RelatedMomentResult[] = []
    for (const edge of edges) {
      const targetM = moments.find(m => m.id === edge.related_id)
      if (targetM) {
        results.push({
          id: targetM.id,
          content: targetM.content,
          summary: targetM.summary,
          createdAt: targetM.created_at,
          relationType: edge.relation_type,
          weight: edge.weight,
        })
      }
    }

    return {
      baseMoment: { summary: baseMoment.summary, content: baseMoment.content },
      related: results
    }
  } catch (err) {
    console.error('[RelationshipRetriever] 연관 생각 조회 실패:', err)
    return { baseMoment: null, related: [] }
  }
}
