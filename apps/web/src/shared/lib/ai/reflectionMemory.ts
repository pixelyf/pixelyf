import prisma from '@/shared/lib/prisma'
import { compactMemories } from './compaction'
import {
  type MemoryMetadata,
  resolveReflectionMemoryMetadata,
  type ReflectableMemoryStream,
} from './memoryPolicy'
import { buildActiveMemoryWhere } from './memorySemantics'

type ReflectionMemoryRow = {
  id: string
  theme: string
  source: string
  memoryNamespace: string | null
  memoryVisibility: string | null
  partnerUserId: string | null
}

export async function compactReflectionLayer(params: {
  soulId: string
  stream: ReflectableMemoryStream
  memoryLayer: 'RAW' | 'COMPRESSED'
  since?: Date
}) {
  const { soulId, stream, memoryLayer, since } = params
  const memories = await prisma.aiMemory.findMany({
    where: {
      aiSoulId: soulId,
      memoryLayer,
      memoryStream: stream,
      AND: [
        buildActiveMemoryWhere(),
        { derivationOutputs: { none: {} } },
      ],
      ...(memoryLayer === 'COMPRESSED'
        ? { isPromoted: false, ...(since ? { createdAt: { gte: since } } : {}) }
        : {}),
    },
    select: {
      id: true,
      theme: true,
      source: true,
      memoryNamespace: true,
      memoryVisibility: true,
      partnerUserId: true,
    },
  })

  if (memories.length === 0) {
    return
  }

  const groups = new Map<string, { metadata: MemoryMetadata; memories: ReflectionMemoryRow[] }>()
  for (const memory of memories) {
    const metadata = resolveReflectionMemoryMetadata(stream, {
      ...memory,
      memoryStream: stream,
    })
    const key = JSON.stringify(metadata)
    const group = groups.get(key) ?? { metadata, memories: [] }
    group.memories.push(memory)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    await compactMemories({
      soulId,
      stream,
      rawMemories: group.memories.map(({ id, theme }) => ({ id, theme })),
      source: `${group.metadata.memoryNamespace}_${memoryLayer}_COMPACTION`,
      metadata: group.metadata,
    })
  }
}
