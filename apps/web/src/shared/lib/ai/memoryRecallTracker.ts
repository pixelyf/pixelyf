import { createHash } from 'node:crypto'
import prisma from '@/shared/lib/prisma'

export type MemoryRecallQueryType = 'PROMPT_RAG' | 'DIRECT_CHAT_RAG' | 'HEARTBEAT_RAG'

export type RecordMemoryRecallParams = {
  soulId: string
  memoryIds: string[]
  queryType: MemoryRecallQueryType
  queryText: string
  partnerUserId?: string | null
}

type MemoryPromotionEvidenceRow = {
  memoryId: string
  memoryStream: string
  recallCount: number
  uniquePartners: number
  uniqueContexts: number
}

type MemoryRecallQueueState = {
  items: RecordMemoryRecallParams[]
  timer: ReturnType<typeof setTimeout> | null
  flushing: boolean
}

declare global {
  // eslint-disable-next-line no-var
  var __pixelyfMemoryRecallQueue: MemoryRecallQueueState | undefined
}

const RECALL_QUEUE_FLUSH_MS = readPositiveIntEnv('AI_MEMORY_RECALL_QUEUE_FLUSH_MS', 5_000)
const RECALL_QUEUE_MAX_ITEMS = readPositiveIntEnv('AI_MEMORY_RECALL_QUEUE_MAX_ITEMS', 100)

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = parseInt(process.env[name] || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getRecallQueueState(): MemoryRecallQueueState {
  if (!globalThis.__pixelyfMemoryRecallQueue) {
    globalThis.__pixelyfMemoryRecallQueue = {
      items: [],
      timer: null,
      flushing: false,
    }
  }
  return globalThis.__pixelyfMemoryRecallQueue
}

function buildRecallQueryHash(queryText: string) {
  const normalized = queryText.trim().replace(/\s+/g, ' ').slice(0, 2000)
  return createHash('sha256').update(normalized).digest('hex')
}

function buildRecallGroupKey(params: RecordMemoryRecallParams) {
  return [
    params.soulId,
    params.queryType,
    params.partnerUserId ?? '',
    buildRecallQueryHash(params.queryText),
  ].join('|')
}

function scheduleRecallQueueFlush(delayMs: number) {
  const state = getRecallQueueState()
  if (state.timer) {
    return
  }

  state.timer = setTimeout(() => {
    state.timer = null
    flushMemoryRecallEventQueue().catch((error) => {
      console.error('[MemoryRecall] 회상 증거 큐 flush 실패:', error)
    })
  }, delayMs)
}

export function enqueueMemoryRecallEvents(params: RecordMemoryRecallParams): void {
  const uniqueMemoryIds = [...new Set(params.memoryIds)].filter(Boolean)
  if (uniqueMemoryIds.length === 0) {
    return
  }

  const state = getRecallQueueState()
  state.items.push({ ...params, memoryIds: uniqueMemoryIds })

  if (state.items.length >= RECALL_QUEUE_MAX_ITEMS) {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }
    flushMemoryRecallEventQueue().catch((error) => {
      console.error('[MemoryRecall] 회상 증거 큐 즉시 flush 실패:', error)
    })
    return
  }

  scheduleRecallQueueFlush(RECALL_QUEUE_FLUSH_MS)
}

export async function flushMemoryRecallEventQueue(): Promise<void> {
  const state = getRecallQueueState()
  if (state.flushing || state.items.length === 0) {
    return
  }

  state.flushing = true
  const pending = state.items.splice(0, state.items.length)

  try {
    const groups = new Map<string, RecordMemoryRecallParams>()
    for (const item of pending) {
      const key = buildRecallGroupKey(item)
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, { ...item, memoryIds: [...new Set(item.memoryIds)] })
        continue
      }
      existing.memoryIds = [...new Set([...existing.memoryIds, ...item.memoryIds])]
    }

    for (const group of groups.values()) {
      await recordMemoryRecallEvents(group)
    }
  } finally {
    state.flushing = false
    if (state.items.length > 0) {
      scheduleRecallQueueFlush(0)
    }
  }
}

export async function recordMemoryRecallEvents(params: RecordMemoryRecallParams): Promise<void> {
  const { soulId, memoryIds, queryType, queryText, partnerUserId = null } = params
  const uniqueMemoryIds = [...new Set(memoryIds)].filter(Boolean)

  if (uniqueMemoryIds.length === 0) {
    return
  }

  const queryHash = buildRecallQueryHash(queryText)

  await prisma.$transaction(async (tx) => {
    const scopedMemories = await tx.aiMemory.findMany({
      where: {
        aiSoulId: soulId,
        id: { in: uniqueMemoryIds },
      },
      select: { id: true },
    })
    const scopedMemoryIds = scopedMemories.map((memory) => memory.id)
    if (scopedMemoryIds.length === 0) {
      return
    }

    await tx.aiMemoryRecallEvent.createMany({
      data: scopedMemoryIds.map((memoryId) => ({
        aiSoulId: soulId,
        memoryId,
        queryType,
        queryHash,
        partnerUserId,
      })),
    })

    await tx.aiMemory.updateMany({
      where: {
        aiSoulId: soulId,
        id: { in: scopedMemoryIds },
      },
      data: { recallCount: { increment: 1 } },
    })
  })
}

export async function loadMemoryPromotionEvidence(
  soulId: string,
  since: Date,
): Promise<Map<string, MemoryPromotionEvidenceRow>> {
  const rows = await prisma.$queryRawUnsafe<MemoryPromotionEvidenceRow[]>(
    `SELECT
        e.memory_id AS "memoryId",
        m.memory_stream AS "memoryStream",
        COUNT(*)::int AS "recallCount",
        COUNT(DISTINCT e.partner_user_id)::int AS "uniquePartners",
        COUNT(DISTINCT ROW(e.query_type, e.partner_user_id, e.query_hash))::int AS "uniqueContexts"
      FROM ai_memory_recall_events e
      INNER JOIN ai_memories m
        ON m.id = e.memory_id
      WHERE e.ai_soul_id = $1::uuid
        AND e.recalled_at >= $2::timestamptz
        AND m.memory_layer = 'COMPRESSED'
        AND m.is_promoted = false
        AND m.memory_stream IN ('OWNER', 'SELF')
        AND m.invalidated_at IS NULL
        AND m.is_locked = false
      GROUP BY e.memory_id, m.memory_stream`,
    soulId,
    since,
  )

  return new Map(rows.map((row) => [row.memoryId, row]))
}
