import prisma from '@/shared/lib/prisma'
import { AiProvider } from '../provider'
import { callEmbedding } from '../llm'
import { buildHeartbeatRetrievalScope, retrieveAiMemories } from '../memoryRetrievalService'
import { recordMemoryTrace } from '../memoryTrace'

export interface RetrievalResult {
  id: string
  concept: string
  type: string
  relevanceScore: number
  recencyScore: number
  importanceScore: number
  totalScore: number
  connectedEdges: {
    relation: string
    concept: string
    direction: 'OUT' | 'IN'
  }[]
}

const RETRIEVAL_WEIGHTS = {
  ALPHA: 1.0, // Recency 가중치
  BETA: 1.0,  // Importance 가중치
  GAMMA: 2.0  // Relevance 가중치 (가장 중요)
}

const MEMORY_AUGMENT_HYBRID_POOL_LIMIT = 8

/**
 * AMGE v5 Layer 2 - 기억 검색 엔진 (Memory Retriever)
 * Stanford Generative Agents의 Scoring Formula를 pgvector $queryRaw로 최적화하여 1-Hop 쿼리로 추출합니다.
 * 
 * Score = α*Recency + β*Importance + γ*Relevance
 * 
 * [v2] 임베딩 생성 실패 시 importance + RANDOM() 기반 폴백 인출 추가
 */
export async function retrieveMemory(
  soulId: string,
  stimulus: string,
  apiKey: string,
  provider: AiProvider,
  topK: number = 5
): Promise<RetrievalResult[]> {
  const traceStartedAt = Date.now()
  try {
    // 1. 자극(Stimulus)에 대한 1536차원 임베딩 1회 생성
    // Matryoshka 슬라이싱: 1536차원 → slice(0,768)로 지식그래프(avatar_nodes)용
    //                      전체 1536차원으로 장기기억(ai_memories)용
    // 기존: generateEmbedding(768) + callEmbedding(1536) = 2회 순차 호출 → 병목
    // 수정: callEmbedding(1536) 1회 → 임베딩 API 비용/지연 50% 절감
    const fullEmbedding = await callEmbedding(apiKey, provider, stimulus)
    const stimulusEmbedding = fullEmbedding ? fullEmbedding.slice(0, 768) : null
    
    let rawNodes: any[]

    if (!stimulusEmbedding) {
      // ── 폴백: 임베딩 생성 실패 시 importance 기반 인출 ──
      console.warn(`[MemoryRetriever] ⚠️ 임베딩 실패 → 폴백 인출 (soulId: ${soulId.substring(0, 8)})`)
      
      rawNodes = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          concept,
          type,
          importance as "importanceScore",
          0.5 as "relevanceScore",
          power(0.99, extract(epoch from (now() - last_access)) / 3600) as "recencyScore",
          (
            ${RETRIEVAL_WEIGHTS.ALPHA} * power(0.99, extract(epoch from (now() - last_access)) / 3600) + 
            ${RETRIEVAL_WEIGHTS.BETA} * importance + 
            0.5
          ) as "totalScore"
        FROM avatar_nodes
        WHERE soul_id = ${soulId}::uuid
        ORDER BY importance DESC, RANDOM()
        LIMIT ${topK}
      `
    } else {
      // ── 정상 경로: pgvector 코사인 유사도 쿼리 (768차원 슬라이스) ──
      const embeddingStr = `[${stimulusEmbedding.join(',')}]`

      rawNodes = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          concept,
          type,
          importance as "importanceScore",
          1 - (embedding <=> ${embeddingStr}::vector) as "relevanceScore",
          power(0.99, extract(epoch from (now() - last_access)) / 3600) as "recencyScore",
          (
            ${RETRIEVAL_WEIGHTS.ALPHA} * power(0.99, extract(epoch from (now() - last_access)) / 3600) + 
            ${RETRIEVAL_WEIGHTS.BETA} * importance + 
            ${RETRIEVAL_WEIGHTS.GAMMA} * (1 - (embedding <=> ${embeddingStr}::vector))
          ) as "totalScore"
        FROM avatar_nodes
        WHERE soul_id = ${soulId}::uuid
          AND embedding IS NOT NULL
        ORDER BY "totalScore" DESC
        LIMIT ${topK}
      `
    }

    // ── [STEP A] ai_memories 장기기억 보조 검색 ──
    // 14번 설계서 인프라 활용: 주인 대화 기억 + Louvain 커뮤니티 요약
    try {
      if (fullEmbedding) {
        const scope = buildHeartbeatRetrievalScope({
          soulId,
          streams: ['OWNER', 'SELF'],
        })
        const rankedMemoryHits = await retrieveAiMemories({
          soulId,
          queryText: stimulus,
          queryType: 'HEARTBEAT_RAG',
          limit: 2,
          recentPoolLimit: MEMORY_AUGMENT_HYBRID_POOL_LIMIT,
          recencyLambda: 0.01,
          apiKey,
          provider,
          where: scope.where,
          vectorSqlWhere: scope.vectorSqlWhere,
          vectorSqlParams: scope.vectorSqlParams,
        })

        if (rankedMemoryHits.length > 0) {
          const memoryAsNodes = rankedMemoryHits.map(m => ({
            id: m.id,
            concept: m.communitySummary
              ? `${m.theme} (소속 커뮤니티 소식: ${m.communitySummary})`
              : m.theme,
            type: 'MEMORY',
            importanceScore: Math.min(1, Math.max(0, (m.importanceScore ?? 0) / 10)),
            relevanceScore: m.vectorScore ?? 0.5,
            recencyScore: 0.5,
            totalScore: (m.vectorScore ?? 0.5) + Math.min(1, Math.max(0, (m.importanceScore ?? 0) / 10)),
            connectedEdges: []
          }))
          rawNodes = [...rawNodes, ...memoryAsNodes]
          rawNodes = rawNodes
            .sort((a: any, b: any) => b.totalScore - a.totalScore)
            .slice(0, topK)
        }
      }
    } catch (err) {
      console.warn('[MemoryRetriever] ai_memories 보조 검색 실패, 기존 노드만 사용:', err)
    }

    if (rawNodes.length === 0) {
      await recordMemoryTrace({
        soulId,
        stage: 'retrieve',
        traceKey: 'HEARTBEAT_GRAPH',
        status: 'blocked',
        durationMs: Date.now() - traceStartedAt,
        payload: {
          reason: 'no_raw_nodes',
          stimulus,
          topK,
        },
      })
      return []
    }

    // 3. 인출된 핵심 노드(Spark Nodes)들의 주변 컨텍스트(Edge) 1-Hop 확장 조회
    const nodeIds = rawNodes.map((n: any) => n.id)
    const edges = await prisma.avatarEdge.findMany({
      where: {
        OR: [
          { sourceId: { in: nodeIds } },
          { targetId: { in: nodeIds } }
        ]
      },
      include: {
        sourceNode: { select: { id: true, concept: true } },
        targetNode: { select: { id: true, concept: true } }
      }
    })

    // 4. 결과 조립 (Node + Connected Edges)
    const results: RetrievalResult[] = rawNodes.map((node: any) => {
      const connectedEdges = edges
        .filter((e: any) => e.sourceId === node.id || e.targetId === node.id)
        .map((e: any) => {
          if (e.sourceId === node.id) {
            return { relation: e.relationType, concept: e.targetNode.concept, direction: 'OUT' as const }
          } else {
            return { relation: e.relationType, concept: e.sourceNode.concept, direction: 'IN' as const }
          }
        })

      return {
        id: node.id,
        concept: node.concept,
        type: node.type,
        relevanceScore: node.relevanceScore,
        recencyScore: node.recencyScore,
        importanceScore: node.importanceScore,
        totalScore: node.totalScore,
        connectedEdges
      }
    })

    await recordMemoryTrace({
      soulId,
      stage: 'retrieve',
      traceKey: 'HEARTBEAT_GRAPH',
      status: 'success',
      durationMs: Date.now() - traceStartedAt,
      payload: {
        stimulus,
        topK,
        returnedCount: results.length,
        graphNodeCount: rawNodes.length,
        edgeCount: edges.length,
      },
    })

    return results
  } catch (error) {
    console.error('[MemoryRetriever] 기억 인출 실패:', error)
    
    // ── 최후 폴백: DB 쿼리 자체 실패 시에도 importance 기반 인출 시도 ──
    try {
      console.warn(`[MemoryRetriever] ⚠️ 최후 폴백 실행 (soulId: ${soulId.substring(0, 8)})`)
      const fallbackNodes = await prisma.avatarNode.findMany({
        where: { soulId },
        orderBy: { importance: 'desc' },
        take: topK,
      })
      const fallbackResults = fallbackNodes.map(n => ({
        id: n.id,
        concept: n.concept,
        type: n.type,
        relevanceScore: 0.5,
        recencyScore: 0.5,
        importanceScore: n.importance,
        totalScore: n.importance + 1.0,
        connectedEdges: []
      }))
      await recordMemoryTrace({
        soulId,
        stage: 'retrieve',
        traceKey: 'HEARTBEAT_GRAPH',
        status: 'blocked',
        durationMs: Date.now() - traceStartedAt,
        payload: {
          reason: 'graph_query_failed_fallback',
          stimulus,
          topK,
          returnedCount: fallbackResults.length,
        },
      })
      return fallbackResults
    } catch {
      await recordMemoryTrace({
        soulId,
        stage: 'retrieve',
        traceKey: 'HEARTBEAT_GRAPH',
        status: 'error',
        durationMs: Date.now() - traceStartedAt,
        payload: {
          reason: 'graph_query_and_fallback_failed',
          stimulus,
          topK,
        },
      })
      return []
    }
  }
}
