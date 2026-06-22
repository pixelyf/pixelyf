import prisma from '@/shared/lib/prisma'
import { callLLM } from '../llm'
import { AiProvider } from '../provider'
import { AMGE_MODELS } from '../modelSelector'
import { mergeGraphToDb } from './graphBuilder'
import type { GraphExtractionResult } from './graphBuilder'

/**
 * AMGE v5 시드 전용 추출 프롬프트
 * 
 * soulPrompt에는 "당신은 OOO 직업인 OOO입니다" 같은 최소한의 정보만 있다.
 * 이 짧은 텍스트에서 직업·이름을 파싱하고, LLM에게 해당 직업/인물이
 * 일상에서 연상할 법한 **구체적 생활 키워드**를 15~20개 생성하게 한다.
 * 
 * ⚠️ 핵심: 시스템 메타 용어(SOUL, AI, 디지털 분신 등)를 절대 생성하지 않도록 강제
 */
const SEED_EXTRACTION_PROMPT = `
You are an expert at extracting everyday life keywords from a person's description.
Respond in the SAME LANGUAGE as the person description below.

Read the person description and extract **specific keywords (Entity)** and **relationships between keywords (Relationship)** that this person would frequently encounter, think about, and experience in daily life.

[Extraction Rules]
1. Extract exactly 15-20 keywords. (minimum 15)
2. Distribute evenly across these categories:
   - Daily activities
   - Food/Drinks
   - Places
   - Emotions/States
   - Objects/Tools
   - Weather/Time
   - Hobbies/Interests
3. Include 3-5 keywords derived from their occupation (not the job title itself, but experiences from work life).
4. Emotions must be a balanced mix of positive, negative, and neutral.

[Forbidden]
- System/meta terms: "SOUL", "AI", "digital self", "personality", "inner world", "independent being"
- Teleological words: "growth", "narrative", "challenge"
- Abstract/vague words (e.g., "thoughts", "feelings", "inner universe")
- The person's name itself as a keyword

[Entity Types]
ACTIVITY, FOOD, PLACE, EMOTION, OBJECT, WEATHER, HOBBY, WORK_CONTEXT

[Relationship Types]
CAUSES, COOCCURS, REMINDS, CONTRASTS

[JSON Output Format]
{
  "entities": [
    { "concept": "string", "type": "string", "importance": number(1-10) }
  ],
  "relationships": [
    { "source": "string", "target": "string", "type": "string", "weight": 0.1-1.0 }
  ]
}

Importance scoring:
1 is completely mundane, 10 is extremely emotional or life-changing.
`

/**
 * v5 AMGE 초기 그래프 시딩 — 전면 재설계 (2026-05-11)
 * 
 * 기존 문제: soulPrompt의 시스템 메타 텍스트에서 추출하여 'SOUL', '성격' 등 쓰레기 노드 생성
 * 해결: 시드 전용 프롬프트로 직업/인물 맥락에서 구체적 생활 키워드를 LLM이 직접 생성
 * 
 * @param soulId 대상 AI 아바타 ID
 * @param apiKey 사용자 복호화 API 키
 * @param provider LLM 제공자
 */
export async function seedInitialGraph(
  soulId: string,
  apiKey: string,
  provider: AiProvider
): Promise<boolean> {
  try {
    const soul = await prisma.aiSoul.findUnique({
      where: { id: soulId },
      select: { soulPrompt: true }
    })

    if (!soul || !soul.soulPrompt) {
      console.warn(`[SeedGraph] 대상 AiSoul을 찾을 수 없거나 프롬프트가 비어있습니다. (soulId: ${soulId})`)
      return false
    }

    // 1. 시드 전용 프롬프트로 생활 키워드 생성 (기존 extractGraphFromText 대신)
    console.log(`[SeedGraph] soulId: ${soulId} - 시드 전용 추출 시작...`)
    
    const result = await callLLM({
      apiKey,
      provider,
      model: AMGE_MODELS[provider],
      systemPrompt: SEED_EXTRACTION_PROMPT,
      userPrompt: `인물 설명: "${soul.soulPrompt}"`,
      responseFormat: 'json',
      temperature: 0.7, // 다양성을 위해 약간 높게
    })

    let data: any
    try {
      data = JSON.parse(result.content)
    } catch {
      console.error(`[SeedGraph] JSON 파싱 실패 (soulId: ${soulId})`)
      return false
    }

    const entities = Array.isArray(data.entities) ? data.entities : []
    const relationships = Array.isArray(data.relationships) ? data.relationships : []

    if (entities.length < 5) {
      console.warn(`[SeedGraph] 추출된 엔티티가 너무 적습니다: ${entities.length}개 (soulId: ${soulId})`)
      return false
    }

    // 2. importance를 [0, 1] 범위로 정규화
    const graphData: GraphExtractionResult = {
      entities: entities.map((e: any) => ({
        concept: e.concept,
        type: e.type || 'ABSTRACT',
        importance: typeof e.importance === 'number' 
          ? Math.max(0.1, Math.min(1.0, e.importance / 10))
          : 0.5,
      })),
      relationships: relationships.map((r: any) => ({
        ...r,
        weight: Math.max(0.3, Math.min(1.0, r.weight || 0.5)),
      }))
    }

    // 3. DB에 병합 (importance 포함)
    await mergeGraphToDb(soulId, graphData, apiKey, provider)

    console.log(`[SeedGraph] 성공: ${graphData.entities.length}개 Entity, ${graphData.relationships.length}개 Edge 주입 완료. (soulId: ${soulId})`)
    return true
  } catch (error) {
    console.error('[SeedGraph] 초기 그래프 주입 실패:', error)
    return false
  }
}
