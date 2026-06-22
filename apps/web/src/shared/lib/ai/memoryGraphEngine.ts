/**
 * [Neural RAG] 기억 군집 엔진
 * 
 * DEEP Reflection 배치에서 호출.
 * 
 * 1. Soul의 활성 LONG_TERM 기억 중 제한 후보군을 조회
 * 2. pgvector top-k 근접 후보로 graphology 엣지 매핑 (유사도 > 0.3인 쌍만)
 * 3. Louvain 알고리즘으로 communityId 산출
 * 4. 커뮤니티별 요약 1줄을 LLM으로 생성 (Microsoft GraphRAG 요약 패턴)
 * 5. DB 업데이트
 */

import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import prisma from '@/shared/lib/prisma'
import { callLLM } from './llm'
import { resolveApiKey } from './compaction'
import { buildActiveMemorySql } from './memorySemantics'
import { recordMemoryTrace } from './memoryTrace'
import { COMPACTION_MODELS } from './modelSelector'

const SIMILARITY_THRESHOLD = 0.3  // 엣지 생성 임계값
const MIN_MEMORIES_FOR_GRAPH = 5  // 최소 기억 수

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = parseInt(process.env[name] || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const MAX_MEMORIES_FOR_GRAPH = readPositiveIntEnv('AI_MEMORY_GRAPH_MAX_MEMORIES', 600)
const EDGE_CANDIDATES_PER_MEMORY = readPositiveIntEnv('AI_MEMORY_GRAPH_EDGE_CANDIDATES', 12)

export interface RebuildResult {
  totalMemories: number
  communities: number
  summariesGenerated: number
}

export async function rebuildMemoryCommunities(soulId: string): Promise<RebuildResult> {
  const startedAt = Date.now()
  const activeLongTermMemorySql = buildActiveMemorySql('ai_memories')
  // 1. LONG_TERM 기억 제한 후보군 조회
  const memories = await prisma.$queryRawUnsafe<{
    id: string
    theme: string
    source: string
  }[]>(
    `SELECT id, theme, source FROM ai_memories 
     WHERE ai_soul_id = $1::uuid 
       AND memory_stream IN ('OWNER', 'SELF')
       AND memory_layer = 'LONG_TERM' 
       AND ${activeLongTermMemorySql}
       AND embedding IS NOT NULL
     ORDER BY importance_score DESC, created_at DESC
     LIMIT $2`,
    soulId,
    MAX_MEMORIES_FOR_GRAPH
  )

  if (memories.length < MIN_MEMORIES_FOR_GRAPH) {
    await recordMemoryTrace({
      soulId,
      stage: 'community_rebuild',
      traceKey: 'GRAPH',
      status: 'blocked',
      durationMs: Date.now() - startedAt,
      payload: { reason: 'INSUFFICIENT_MEMORIES', totalMemories: memories.length },
    })
    return { totalMemories: memories.length, communities: 0, summariesGenerated: 0 }
  }

  // 2. 코사인 유사도 후보 엣지 산출 (pgvector top-k, Soul별 격리)
  const pairs = await prisma.$queryRawUnsafe<{
    id_a: string
    id_b: string
    similarity: number
  }[]>(
    `WITH candidates AS MATERIALIZED (
       SELECT id, embedding
       FROM ai_memories
       WHERE ai_soul_id = $1::uuid
         AND memory_stream IN ('OWNER', 'SELF')
         AND memory_layer = 'LONG_TERM'
         AND ${buildActiveMemorySql('ai_memories')}
         AND embedding IS NOT NULL
       ORDER BY importance_score DESC, created_at DESC
       LIMIT $2
     )
     SELECT a.id AS id_a, nearest.id_b, nearest.similarity
     FROM candidates a
     CROSS JOIN LATERAL (
       SELECT b.id AS id_b,
              1 - (a.embedding <=> b.embedding) AS similarity
       FROM candidates b
       WHERE b.id <> a.id
       ORDER BY a.embedding <=> b.embedding
       LIMIT $4
     ) nearest
     WHERE a.id < nearest.id_b
       AND nearest.similarity > $3`,
    soulId,
    MAX_MEMORIES_FOR_GRAPH,
    SIMILARITY_THRESHOLD,
    EDGE_CANDIDATES_PER_MEMORY
  )

  // 3. graphology 그래프 빌드
  const graph = new Graph()
  for (const m of memories) {
    graph.addNode(m.id, { theme: m.theme, source: m.source })
  }
  for (const p of pairs) {
    if (graph.hasNode(p.id_a) && graph.hasNode(p.id_b)) {
      // 주인과의 1:1 대화(DIRECT_CHAT) 노드가 연결되어 있다면, 가중치 보너스 적용
      const nodeAAttr = graph.getNodeAttributes(p.id_a)
      const nodeBAttr = graph.getNodeAttributes(p.id_b)
      const directBonus = (
        nodeAAttr.source?.startsWith('DIRECT_CHAT')
        || nodeBAttr.source?.startsWith('DIRECT_CHAT')
      ) ? 0.20 : 0.0

      graph.addEdge(p.id_a, p.id_b, { similarity: p.similarity + directBonus })
    }
  }

  // 4. Louvain 커뮤니티 감지
  louvain.assign(graph, {
    getEdgeWeight: 'similarity',
    resolution: 1.0,
    nodeCommunityAttribute: 'community'
  })

  // 5. communityId DB 업데이트
  const communityMap = new Map<number, string[]>()
  graph.forEachNode((node, attrs) => {
    const cid = attrs.community as number
    if (!communityMap.has(cid)) {
      communityMap.set(cid, [])
    }
    communityMap.get(cid)!.push(node)
  })

  for (const [cid, memoryIds] of communityMap) {
    await prisma.aiMemory.updateMany({
      where: { id: { in: memoryIds } },
      data: { communityId: cid }
    })
  }

  // 6. 커뮤니티별 요약 생성 (GraphRAG 패턴)
  const { apiKey, provider } = await resolveApiKey(soulId)
  let summariesGenerated = 0
  const summaryDetails: Array<{ cid: number; memoryIds: string[]; summary: string }> = []

  for (const [cid, memoryIds] of communityMap) {
    if (memoryIds.length < 2) continue

    const themes = memories
      .filter(m => memoryIds.includes(m.id))
      .map(m => m.theme)
      .slice(0, 10) // 최대 10건으로 제한

    try {
      const summaryResult = await callLLM({
        apiKey,
        provider,
        model: COMPACTION_MODELS[provider],
        systemPrompt: `당신은 기억 요약 전문가입니다. 아래 기억들의 공통 주제를 1줄(50자 이내)로 요약하세요. 요약만 출력하세요.`,
        userPrompt: themes.map((t, i) => `${i + 1}. ${t}`).join('\n'),
        responseFormat: 'text',
        temperature: 0.3,
        maxOutputTokens: 50,
        thinkingBudget: 0
      })

      const summary = summaryResult.content.trim()
      await prisma.aiMemory.updateMany({
        where: { id: { in: memoryIds } },
        data: { communitySummary: summary }
      })
      summaryDetails.push({ cid, memoryIds, summary })
      summariesGenerated++
    } catch (summaryErr: any) {
      console.error(`[MemoryGraph] Community ${cid} 요약 생성 실패 (스킵):`, summaryErr?.message)
    }
  }

  const result = {
    totalMemories: memories.length,
    communities: communityMap.size,
    summariesGenerated
  }
  await recordMemoryTrace({
    soulId,
    stage: 'community_rebuild',
    traceKey: 'GRAPH',
    status: 'success',
    durationMs: Date.now() - startedAt,
    payload: {
      communities: communityMap.size,
      summariesGenerated,
      totalMemories: memories.length,
      maxMemoriesForGraph: MAX_MEMORIES_FOR_GRAPH,
      edgeCandidatesPerMemory: EDGE_CANDIDATES_PER_MEMORY,
      communityMap: [...communityMap.entries()].map(([cid, memoryIds]) => ({ cid, memoryIds })),
      summaries: summaryDetails,
    },
  })

  return result
}
