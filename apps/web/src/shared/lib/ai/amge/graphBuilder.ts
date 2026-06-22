import prisma from '@/shared/lib/prisma'
import { callLLM } from '../llm'
import { AiProvider } from '../provider'
import { AMGE_MODELS } from '../modelSelector'
import { generateEmbedding } from './embedding'

export interface ExtractedEntity {
  concept: string
  type: string
  importance?: number  // [0, 1] — 시드 시 LLM이 사전 평가, 런타임 시 자동 평가
}

export interface ExtractedRelationship {
  source: string
  target: string
  type: string
  weight: number
}

export interface GraphExtractionResult {
  entities: ExtractedEntity[]
  relationships: ExtractedRelationship[]
}

const GRAPH_EXTRACTION_PROMPT = `
당신은 아바타의 무의식 그래프를 구축하는 정보 추출기입니다.
주어진 텍스트에서 아바타의 기억이나 정체성, 환경을 구성하는 주요 개념(Entity)과 관계(Relationship)를 추출하세요.

[제약 조건]
1. 엔티티 타입(type)은 다음 중 하나만 사용하세요: PERSON, OBJECT, EMOTION, LOCATION, ABSTRACT, ACTION
2. 관계 타입(type)은 다음 중 하나만 사용하세요: IS_A, HAS_A, FEELS, CAUSES, LOCATED_IN
3. 관계의 가중치(weight)는 0.1에서 1.0 사이의 숫자로 설정하세요.
4. 너무 사소한 단어는 무시하고, 아바타의 정체성이나 감정에 영향을 줄 수 있는 핵심 단어만 1~4개 추출하세요.
5. 반드시 아래 JSON 형식으로만 출력하고 다른 설명은 생략하세요.

[JSON 출력 형식]
{
  "entities": [
    { "concept": "문자열", "type": "문자열" }
  ],
  "relationships": [
    { "source": "문자열", "target": "문자열", "type": "문자열", "weight": 0.8 }
  ]
}
`

/**
 * 텍스트에서 Entity와 Relationship을 추출합니다. (Layer 1 추출 파이프라인)
 */
export async function extractGraphFromText(
  apiKey: string,
  provider: AiProvider,
  text: string
): Promise<GraphExtractionResult | null> {
  try {
    const result = await callLLM({
      apiKey,
      provider,
      model: AMGE_MODELS[provider],
      systemPrompt: GRAPH_EXTRACTION_PROMPT,
      userPrompt: `텍스트: "${text}"`,
      responseFormat: 'json',
      temperature: 0.1,
    })

    const data = JSON.parse(result.content)
    return {
      entities: Array.isArray(data.entities) ? data.entities : [],
      relationships: Array.isArray(data.relationships) ? data.relationships : [],
    }
  } catch (error) {
    console.error('[GraphBuilder] Entity 추출 실패:', error)
    return null
  }
}

/**
 * LLM 기반 Importance 평가 (설계서 §3.2 스펙)
 * 해당 개념이 한 사람의 삶에서 얼마나 감정적으로 강렬한 경험인지 1~10점 평가
 * @returns [0, 1] 정규화된 importance 값
 */
async function evaluateImportance(
  apiKey: string,
  provider: AiProvider,
  concept: string
): Promise<number> {
  try {
    const result = await callLLM({
      apiKey,
      provider,
      model: AMGE_MODELS[provider],
      systemPrompt: `아래 개념이 한 사람의 일상에서 얼마나 감정적으로 강렬한 경험인지 1(매우 일상적)~10(인생을 바꿀 수 있는 사건) 점수로 평가하라. 숫자만 응답하라.`,
      userPrompt: `개념: "${concept}"`,
      temperature: 0.1,
      maxOutputTokens: 10,
    })
    const score = parseInt(result.content.trim(), 10)
    if (isNaN(score) || score < 1 || score > 10) return 0.5
    return score / 10
  } catch {
    return 0.5 // 평가 실패 시 기본값
  }
}

/**
 * 추출된 그래프 데이터를 DB에 병합합니다 (ADD/UPDATE/STRENGTHEN 전략)
 */
export async function mergeGraphToDb(
  soulId: string,
  graphData: GraphExtractionResult,
  apiKey: string,
  provider: AiProvider
) {
  const conceptToIdMap = new Map<string, string>()

  // 1. Entities 병합 (ADD or UPDATE)
  for (const entity of graphData.entities) {
    // 1-1. 정확한 텍스트 매칭 확인
    let existingNode = await prisma.avatarNode.findUnique({
      where: { soulId_concept: { soulId, concept: entity.concept } }
    })

    if (!existingNode) {
      // 1-2. 벡터 기반 유사도 검색 (Cosine Similarity > 0.92 = Distance < 0.08)
      const embedding = await generateEmbedding(apiKey, provider, entity.concept)
      if (!embedding) continue

      // pgvector <=> 연산자는 cosine distance를 반환 (1 - cosine_similarity)
      // Prisma 배열 형식이 아닌 pgvector 전용 문자열 '[0.1, 0.2]' 형식으로 변환해야 함
      const embeddingStr = `[${embedding.join(',')}]`
      const similarNodes = await prisma.$queryRaw<any[]>`
        SELECT id, concept, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
        FROM avatar_nodes
        WHERE soul_id = ${soulId}::uuid
        ORDER BY embedding <=> ${embeddingStr}::vector ASC
        LIMIT 1
      `

      if (similarNodes.length > 0 && similarNodes[0].similarity > 0.92) {
        // [UPDATE 전략] 유사한 노드가 존재하면 최신 접근 시간만 갱신
        existingNode = await prisma.avatarNode.update({
          where: { id: similarNodes[0].id },
          data: { lastAccess: new Date() }
        })
        console.log(`[GraphBuilder] UPDATE (Similarity ${similarNodes[0].similarity.toFixed(2)}): "${entity.concept}" -> "${existingNode.concept}"`)
      } else {
        // [ADD 전략] 새로운 노드 생성 + Importance 평가
        // 시드에서 importance가 사전 평가되었으면 사용, 아니면 LLM 실시간 평가
        const importance = (entity as any).importance 
          ?? await evaluateImportance(apiKey, provider, entity.concept)
        
        existingNode = await prisma.avatarNode.create({
          data: {
            soulId,
            concept: entity.concept,
            type: entity.type,
            importance,
          }
        })
        
        // $executeRaw를 사용하여 vector 컬럼 업데이트 (Prisma Client의 한계 우회)
        await prisma.$executeRaw`
          UPDATE avatar_nodes
          SET embedding = ${embeddingStr}::vector
          WHERE id = ${existingNode.id}::uuid
        `
        console.log(`[GraphBuilder] ADD: "${entity.concept}" (importance: ${importance.toFixed(2)})`)
      }
    } else {
      // 정확히 일치하는 텍스트가 있으면 접근 시간만 갱신
      existingNode = await prisma.avatarNode.update({
        where: { id: existingNode.id },
        data: { lastAccess: new Date() }
      })
    }

    conceptToIdMap.set(entity.concept, existingNode.id)
  }

  // 2. Relationships 병합 (STRENGTHEN)
  for (const rel of graphData.relationships) {
    const sourceId = conceptToIdMap.get(rel.source)
    const targetId = conceptToIdMap.get(rel.target)

    if (!sourceId || !targetId || sourceId === targetId) continue

    const existingEdge = await prisma.avatarEdge.findUnique({
      where: {
        sourceId_targetId_relationType: {
          sourceId,
          targetId,
          relationType: rel.type
        }
      }
    })

    if (existingEdge) {
      // [STRENGTHEN 전략] 기존 엣지 가중치 강화 (최대 1.0)
      const newWeight = Math.min(1.0, existingEdge.weight + 0.1)
      await prisma.avatarEdge.update({
        where: { id: existingEdge.id },
        data: {
          weight: newWeight,
          reinforceCount: existingEdge.reinforceCount + 1,
          lastAccess: new Date()
        }
      })
      console.log(`[GraphBuilder] STRENGTHEN: ${rel.source} -[${rel.type}]-> ${rel.target} (Weight: ${newWeight.toFixed(2)})`)
    } else {
      // 새 엣지 생성
      await prisma.avatarEdge.create({
        data: {
          sourceId,
          targetId,
          relationType: rel.type,
          weight: rel.weight,
        }
      })
      console.log(`[GraphBuilder] ADD EDGE: ${rel.source} -[${rel.type}]-> ${rel.target}`)
    }
  }
}
