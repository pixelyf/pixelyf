import type { Prisma } from '@prisma/client'
import { buildMemoryProvenanceInput, type MemoryProvenanceInput } from './memoryProvenance.ts'
import {
  buildMemorySemanticDefaults,
  type MemoryLayer,
  type MemorySemanticSourceKind,
} from './memorySemantics.ts'
import type { MemoryMetadata, MemoryStream, ReflectableMemoryStream } from './memoryPolicy.ts'

export type { MemoryLayer } from './memorySemantics.ts'
export type PromotedCategory = 'IDENTITY' | 'RELATIONSHIP' | 'EVENT'
export type MemoryWriteAction = 'STORE' | 'HOLD' | 'DROP'

type BaseMemoryCreateParams = {
  aiSoulId: string
  theme: string
  source: string
  metadata?: MemoryMetadata
  provenance?: MemoryProvenanceInput
}

type GateParams = BaseMemoryCreateParams & {
  policySource: MemorySemanticSourceKind
  memoryStream: MemoryStream
  memoryLayer: Exclude<MemoryLayer, 'LONG_TERM'>
  importanceScore?: number
  mergedFrom?: string[]
}

function buildMetadataInput(metadata?: MemoryMetadata) {
  return {
    memoryNamespace: metadata?.memoryNamespace,
    memoryVisibility: metadata?.memoryVisibility,
    partnerUserId: metadata?.partnerUserId,
  }
}

export function buildMemoryWritePlan(params: GateParams): {
  action: MemoryWriteAction
  data: Prisma.AiMemoryUncheckedCreateInput | null
} {
  const {
    aiSoulId,
    memoryStream,
    memoryLayer,
    theme,
    source,
    metadata,
    importanceScore = 0,
    mergedFrom = [],
    policySource,
  } = params

  const trimmedTheme = theme.trim()
  if (!trimmedTheme) {
    return { action: 'DROP', data: null }
  }

  if (policySource === 'DIRECT_CHAT' && memoryLayer === 'COMPRESSED') {
    return { action: 'HOLD', data: null }
  }

  return {
    action: 'STORE',
    data: {
      aiSoulId,
      memoryStream,
      memoryLayer,
      theme: trimmedTheme,
      source,
      importanceScore,
      recallCount: 0,
      uniquePartners: 0,
      isPromoted: false,
      mergedFrom,
      ...buildMetadataInput(metadata),
      ...buildMemoryProvenanceInput(params.provenance),
      ...buildMemorySemanticDefaults({
        policySource,
        memoryLayer,
        metadata,
      }),
    },
  }
}

export function buildPromotionUpdate(
  promotedCategory: PromotedCategory,
  promotedAt: Date = new Date(),
  semantics?: {
    factType?: 'EPISODE' | 'FACT'
    confidence?: number
    validFrom?: Date | null
    supersedesId?: string | null
  },
): Prisma.AiMemoryUncheckedUpdateInput {
  return {
    isPromoted: true,
    promotedCategory,
    promotedAt,
    memoryLayer: 'LONG_TERM',
    factType: semantics?.factType,
    confidence: semantics?.confidence,
    validFrom: semantics?.validFrom,
    validTo: null,
    supersedesId: semantics?.supersedesId ?? null,
    supersededById: null,
  }
}

export function buildRawMemoryCreate(params: BaseMemoryCreateParams & {
  memoryStream: MemoryStream
  importanceScore?: number
}): Prisma.AiMemoryUncheckedCreateInput {
  const plan = buildMemoryWritePlan({
    ...params,
    policySource: 'MOMENT',
    memoryLayer: 'RAW',
  })
  if (!plan.data) {
    throw new Error('RAW memory gate blocked write unexpectedly')
  }
  return plan.data
}

export function buildCompactedMemoryCreate(params: BaseMemoryCreateParams & {
  stream: ReflectableMemoryStream
  importanceScore: number
}): Prisma.AiMemoryUncheckedCreateInput {
  const plan = buildMemoryWritePlan({
    aiSoulId: params.aiSoulId,
    memoryStream: params.stream,
    memoryLayer: 'COMPRESSED',
    theme: params.theme,
    source: params.source,
    metadata: params.metadata,
    importanceScore: params.importanceScore,
    policySource: 'REFLECTION',
  })
  if (!plan.data) {
    throw new Error('COMPRESSED memory gate blocked write unexpectedly')
  }
  return plan.data
}

export function buildPendingDirectChatMemoryCreate(params: BaseMemoryCreateParams & {
  memoryStream: MemoryStream
  importanceScore: number
}): Prisma.AiMemoryUncheckedCreateInput {
  const plan = buildMemoryWritePlan({
    ...params,
    policySource: 'DIRECT_CHAT',
    memoryLayer: 'RAW',
  })
  if (!plan.data) {
    throw new Error('DIRECT_CHAT memory gate blocked write unexpectedly')
  }
  return plan.data
}
