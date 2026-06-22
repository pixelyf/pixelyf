import type { Prisma } from '@prisma/client'
import prisma from '@/shared/lib/prisma'
import { resolveApiKey } from './compaction'
import { rankHybridMemoryCandidates } from './memoryHybridRanker'
import { callEmbedding } from './llm'
import { enqueueMemoryRecallEvents, type MemoryRecallQueryType } from './memoryRecallTracker'
import { buildActiveMemorySql, buildActiveMemoryWhere } from './memorySemantics'
import { recordMemoryTrace } from './memoryTrace'
import { buildVectorMemoryRetrievalSql } from './memoryRetrievalSql'
import type { DirectChatMode, ReflectableMemoryStream } from './memoryPolicy'
import { buildVisitorDirectChatSource } from './memoryPolicy'
import type { AiProvider } from './provider'

export type RetrievedAiMemory = {
  id: string
  theme: string
  communitySummary: string | null
  createdAt: Date
  memoryStream: string
  memoryLayer: string
  source: string
  memoryNamespace: string | null
  memoryVisibility: string | null
  partnerUserId: string | null
  importanceScore: number
  promotedCategory?: string | null
  communityId?: number | null
  vectorScore?: number
}

type RetrieveAiMemoriesParams = {
  soulId: string
  queryText: string
  queryType: MemoryRecallQueryType
  limit: number
  recentPoolLimit: number
  recencyLambda?: number
  recordRecallEvidence?: boolean
  where: Prisma.AiMemoryWhereInput
  vectorSqlWhere: string
  vectorSqlParams?: unknown[]
  partnerUserId?: string | null
  apiKey?: string
  provider?: AiProvider
}

function getBaseSelect() {
  return {
    id: true,
    theme: true,
    communitySummary: true,
    createdAt: true,
    memoryStream: true,
    memoryLayer: true,
    source: true,
    memoryNamespace: true,
    memoryVisibility: true,
    partnerUserId: true,
    importanceScore: true,
    promotedCategory: true,
    communityId: true,
  } as const
}

export async function retrieveAiMemories(params: RetrieveAiMemoriesParams): Promise<RetrievedAiMemory[]> {
  const {
    soulId,
    queryText,
    queryType,
    limit,
    recentPoolLimit,
    where,
    vectorSqlWhere,
    vectorSqlParams = [],
    partnerUserId = null,
    recencyLambda = 0.01,
    recordRecallEvidence = true,
  } = params

  const traceStartedAt = Date.now()
  const normalizedQueryText = queryText.trim()

  try {
    let vectorCandidates: RetrievedAiMemory[] = []

    if (normalizedQueryText.length > 0) {
      let apiKey = params.apiKey
      let provider = params.provider

      if (!apiKey || !provider) {
        const keyInfo = await resolveApiKey(soulId)
        apiKey = keyInfo.apiKey
        provider = keyInfo.provider
      }

      const vector = await callEmbedding(apiKey, provider, normalizedQueryText)
      const vectorStr = vector && vector.length === 1536 ? `[${vector.join(',')}]` : null

      if (vectorStr) {
        vectorCandidates = await prisma.$queryRawUnsafe<RetrievedAiMemory[]>(
          buildVectorMemoryRetrievalSql(vectorSqlWhere),
          soulId,
          vectorStr,
          recencyLambda,
          recentPoolLimit,
          ...vectorSqlParams,
        )
      }
    }

    const recentCandidates = await prisma.aiMemory.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { importanceScore: 'desc' }],
      take: recentPoolLimit,
      select: getBaseSelect(),
    })

    const ranked = rankHybridMemoryCandidates({
      queryText: normalizedQueryText,
      candidates: [...vectorCandidates, ...recentCandidates],
      limit,
      recencyLambda,
    }).map(({ hybridScore, lexicalScore, entityScore, recencyScore, normalizedImportanceScore, normalizedVectorScore, ...memory }) => memory)

    const shouldRecordRecallEvidence = recordRecallEvidence && normalizedQueryText.length > 0

    if (shouldRecordRecallEvidence && ranked.length > 0) {
      enqueueMemoryRecallEvents({
        soulId,
        memoryIds: ranked.map((memory) => memory.id),
        queryType,
        queryText: normalizedQueryText,
        partnerUserId,
      })
    }

    recordMemoryTrace({
      soulId,
      stage: 'retrieve',
      traceKey: queryType,
      status: 'success',
      durationMs: Date.now() - traceStartedAt,
      payload: {
        queryText: normalizedQueryText,
        returnedCount: ranked.length,
        vectorCandidateCount: vectorCandidates.length,
        recentCandidateCount: recentCandidates.length,
        recallEvidenceRecorded: shouldRecordRecallEvidence,
      },
    }).catch(() => {})

    return ranked
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'unknown'
    await recordMemoryTrace({
      soulId,
      stage: 'retrieve',
      traceKey: queryType,
      status: 'error',
      durationMs: Date.now() - traceStartedAt,
      payload: {
        queryText: normalizedQueryText,
        error: errorMessage,
      },
    })
    throw error
  }
}

export function buildLongTermRetrievalScope(params: {
  soulId: string
  streams: ReflectableMemoryStream[]
}) {
  return {
    where: {
      aiSoulId: params.soulId,
      memoryStream: { in: params.streams },
      memoryLayer: 'LONG_TERM',
      isPromoted: true,
      ...buildActiveMemoryWhere(),
    } satisfies Prisma.AiMemoryWhereInput,
    vectorSqlWhere: `memory_stream = ANY($5::text[])
      AND memory_layer = 'LONG_TERM'
      AND is_promoted = true
      AND ${buildActiveMemorySql('ai_memories')}`,
    vectorSqlParams: [params.streams],
  }
}

export function buildHeartbeatRetrievalScope(params: {
  soulId: string
  streams?: ReflectableMemoryStream[]
}) {
  const requestedStreams = new Set(params.streams ?? ['OWNER', 'SELF'])
  const activeLongTermMemoryWhere = buildActiveMemoryWhere()
  const activeLongTermMemorySql = buildActiveMemorySql('ai_memories')

  const ownerWhere = requestedStreams.has('OWNER')
    ? [{
        memoryStream: 'OWNER',
        memoryLayer: 'LONG_TERM',
        isPromoted: true,
        memoryNamespace: 'OWNER_FEED',
        memoryVisibility: 'PUBLIC',
        ...activeLongTermMemoryWhere,
      } satisfies Prisma.AiMemoryWhereInput]
    : []
  const selfWhere = requestedStreams.has('SELF')
    ? [{
        memoryStream: 'SELF',
        memoryLayer: 'LONG_TERM',
        isPromoted: true,
        memoryNamespace: 'SELF_ACTIVITY',
        memoryVisibility: 'INTERNAL',
        ...activeLongTermMemoryWhere,
      } satisfies Prisma.AiMemoryWhereInput]
    : []

  const vectorClauses = [
    requestedStreams.has('OWNER')
      ? `(memory_stream = 'OWNER'
          AND memory_layer = 'LONG_TERM'
          AND is_promoted = true
          AND memory_namespace = 'OWNER_FEED'
          AND memory_visibility = 'PUBLIC'
          AND ${activeLongTermMemorySql})`
      : null,
    requestedStreams.has('SELF')
      ? `(memory_stream = 'SELF'
          AND memory_layer = 'LONG_TERM'
          AND is_promoted = true
          AND memory_namespace = 'SELF_ACTIVITY'
          AND memory_visibility = 'INTERNAL'
          AND ${activeLongTermMemorySql})`
      : null,
  ].filter(Boolean)

  return {
    where: {
      aiSoulId: params.soulId,
      OR: [...ownerWhere, ...selfWhere],
    } satisfies Prisma.AiMemoryWhereInput,
    vectorSqlWhere: `(${vectorClauses.length > 0 ? vectorClauses.join(' OR ') : 'FALSE'})`,
    vectorSqlParams: [],
  }
}

export function buildDirectChatRetrievalScope(params: {
  soulId: string
  mode: DirectChatMode
  userId: string
}) {
  const { soulId, mode, userId } = params
  const visitorSource = buildVisitorDirectChatSource(userId)
  const activeLongTermMemoryWhere = buildActiveMemoryWhere()
  const activeLongTermMemorySql = buildActiveMemorySql('ai_memories')

  return {
    where: {
      aiSoulId: soulId,
      OR: [
        ...(mode === 'OWNER_AVATAR'
          ? [
              {
                memoryStream: 'SELF',
                memoryLayer: 'LONG_TERM',
                isPromoted: true,
                memoryNamespace: 'SELF_ACTIVITY',
                memoryVisibility: 'INTERNAL',
                ...activeLongTermMemoryWhere,
              },
              {
                memoryStream: 'OWNER',
                OR: [
                  {
                    memoryLayer: 'LONG_TERM',
                    isPromoted: true,
                    ...activeLongTermMemoryWhere,
                  },
                  {
                    memoryLayer: { in: ['RAW', 'COMPRESSED'] },
                    AND: [
                      activeLongTermMemoryWhere,
                      {
                        OR: [
                          { memoryNamespace: 'OWNER_DIRECT_CHAT' },
                          { source: 'DIRECT_CHAT:OWNER' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ]
          : []),
        ...(mode === 'VISITOR_AVATAR'
          ? [
              {
                memoryStream: 'OWNER',
                memoryLayer: 'LONG_TERM',
                isPromoted: true,
                memoryNamespace: 'OWNER_FEED',
                memoryVisibility: 'PUBLIC',
                ...activeLongTermMemoryWhere,
              },
              {
                memoryStream: 'VISITOR',
                OR: [
                  {
                    OR: [{ partnerUserId: userId }, { source: visitorSource }],
                    memoryLayer: 'LONG_TERM',
                    isPromoted: true,
                    ...activeLongTermMemoryWhere,
                  },
                  {
                    memoryLayer: { in: ['RAW', 'COMPRESSED'] },
                    AND: [
                      activeLongTermMemoryWhere,
                      { OR: [{ partnerUserId: userId }, { source: visitorSource }] },
                    ],
                  },
                ],
              },
            ]
          : []),
      ],
    } satisfies Prisma.AiMemoryWhereInput,
    vectorSqlWhere: `(
      ($5::text = 'OWNER_AVATAR'
        AND memory_stream = 'SELF'
        AND memory_layer = 'LONG_TERM'
        AND is_promoted = true
        AND memory_namespace = 'SELF_ACTIVITY'
        AND memory_visibility = 'INTERNAL'
        AND ${activeLongTermMemorySql})
      OR ($5::text = 'OWNER_AVATAR' AND memory_stream = 'OWNER' AND (
        (memory_layer = 'LONG_TERM' AND is_promoted = true AND ${activeLongTermMemorySql})
        OR (
          memory_layer IN ('RAW', 'COMPRESSED')
          AND ${activeLongTermMemorySql}
          AND (
            memory_namespace = 'OWNER_DIRECT_CHAT'
            OR source = 'DIRECT_CHAT:OWNER'
          )
        )
      ))
      OR ($5::text = 'VISITOR_AVATAR'
        AND memory_stream = 'OWNER'
        AND memory_layer = 'LONG_TERM'
        AND is_promoted = true
        AND memory_namespace = 'OWNER_FEED'
        AND memory_visibility = 'PUBLIC'
        AND ${activeLongTermMemorySql})
      OR ($5::text = 'VISITOR_AVATAR' AND memory_stream = 'VISITOR' AND (
        partner_user_id = $6::uuid
        OR source = $7::text
      ) AND (
        (memory_layer = 'LONG_TERM' AND is_promoted = true AND ${activeLongTermMemorySql})
        OR (memory_layer IN ('RAW', 'COMPRESSED') AND ${activeLongTermMemorySql})
      ))
    )`,
    vectorSqlParams: [mode, userId, visitorSource],
  }
}
