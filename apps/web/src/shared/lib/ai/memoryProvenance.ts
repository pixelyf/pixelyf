import type { Prisma } from '@prisma/client'

export type MemoryOriginType =
  | 'DIRECT_CHAT'
  | 'MOMENT'
  | 'HEARTBEAT'
  | 'REFLECTION'
  | 'COMMUNITY_REBUILD'
  | 'ADMIN'

export type MemoryProvenanceInput = {
  originType: MemoryOriginType
  originId?: string | null
  derivedFromMemoryIds?: string[]
  mergeReason?: string | null
}

export function buildMemoryProvenanceInput(
  provenance?: MemoryProvenanceInput,
): Pick<
  Prisma.AiMemoryUncheckedCreateInput,
  'originType' | 'originId' | 'derivedFromMemoryIds' | 'mergeReason'
> {
  return {
    originType: provenance?.originType ?? null,
    originId: provenance?.originId ?? null,
    derivedFromMemoryIds: provenance?.derivedFromMemoryIds ?? [],
    mergeReason: provenance?.mergeReason ?? null,
  }
}

export function buildSourceOriginId(source: string, fallback?: string | null) {
  const sourceParts = source.split(':')
  return fallback ?? sourceParts.at(-1) ?? source
}
