import type { Prisma } from '@prisma/client'
import type { MemoryMetadata } from './memoryPolicy.ts'

export type MemoryFactType = 'EPISODE' | 'FACT'

type MemoryTemporalSnapshot = {
  factType?: string | null
  validFrom?: Date | string | null
  validTo?: Date | string | null
  supersededById?: string | null
  invalidatedAt?: Date | string | null
}
export type MemorySemanticSourceKind = 'DIRECT_CHAT' | 'MOMENT' | 'HEARTBEAT' | 'REFLECTION'
export type MemoryPromotedCategory = 'IDENTITY' | 'RELATIONSHIP' | 'EVENT'
export type MemoryLayer = 'RAW' | 'COMPRESSED' | 'LONG_TERM'

type SemanticDefaultsParams = {
  policySource: MemorySemanticSourceKind
  memoryLayer: MemoryLayer
  metadata?: MemoryMetadata
  now?: Date
}

type PromotedSemanticParams = {
  theme: string
  promotedCategory: MemoryPromotedCategory
  importanceScore?: number
  recallCount?: number
}

export type SupersedeCandidateRow = {
  id: string
  theme: string
  createdAt: Date
}

type FactAxis = 'preference' | 'profile' | 'routine' | 'identity'

type FactSlot = {
  axes: Set<FactAxis>
  objectHead: string | null
}

const FACT_CUE_PATTERNS = [
  /좋아|좋아해|선호|취향|싫어|관심사|취미/,
  /직업|회사|업무|전공|학교|거주|사는 곳|출신/,
  /루틴|습관|자주|항상|보통|평소/,
  /이름|소개|정체성|성격|스타일|가치관|목표/,
]

const CHANGE_CUE_PATTERNS = [
  /이제|요즘|최근에는|최근엔|새롭게|방금부터/,
  /더 이상|예전과 달리|전에는|원래는/,
  /바뀌|바꿨|변했|달라졌/,
]

const FACT_STOPWORDS = new Set([
  '그리고', '하지만', '그러나', '정말', '진짜', '그냥', '오늘', '어제', '내일',
  '아바타', '주인', '방문자', '대화', '기억', '최근', '요즘', '이제', '에서',
  '으로', '에게', '나는', '저는', '내가', '제가', '그는', '그녀는', '있다',
  '없다', '한다', '했다', '하는', '또는', 'with', 'from', 'that', 'this',
  '좋아', '좋아해', '좋아하는', '선호', '선호해', '싫어', '싫어해', '취향',
  '가장', '제일', '더', '이상', '원래는', '전에는',
])

const FACT_AXIS_PATTERNS: Array<{ axis: FactAxis; pattern: RegExp }> = [
  { axis: 'preference', pattern: /좋아|좋아해|좋아하는|선호|취향|싫어|관심사|취미/ },
  { axis: 'profile', pattern: /직업|회사|업무|전공|학교|거주|사는 곳|출신/ },
  { axis: 'routine', pattern: /루틴|습관|자주|항상|보통|평소/ },
  { axis: 'identity', pattern: /이름|소개|정체성|성격|스타일|가치관|목표/ },
]

const KOREAN_PARTICLE_SUFFIX = /(으로|에게|에서|부터|까지|처럼|보다|만큼|이라서|라는|이다|였다|입니다|이에요|예요|은|는|이|가|을|를|와|과|도|만|의|로)$/u

function computeBaseConfidence(policySource: MemorySemanticSourceKind, memoryLayer: MemoryLayer) {
  if (policySource === 'REFLECTION' && memoryLayer === 'LONG_TERM') return 0.78
  if (policySource === 'REFLECTION') return 0.62
  if (policySource === 'MOMENT') return 0.58
  if (policySource === 'HEARTBEAT') return 0.52
  return 0.48
}

export function buildMemorySemanticDefaults(
  params: SemanticDefaultsParams,
): Pick<
  Prisma.AiMemoryUncheckedCreateInput,
  'validFrom' | 'validTo' | 'supersededById' | 'supersedesId' | 'factType' | 'confidence'
> {
  const now = params.now ?? new Date()

  return {
    validFrom: now,
    validTo: null,
    supersededById: null,
    supersedesId: null,
    factType: 'EPISODE',
    confidence: computeBaseConfidence(params.policySource, params.memoryLayer),
  }
}

export function inferPromotedMemorySemantics(params: PromotedSemanticParams): {
  factType: MemoryFactType
  confidence: number
} {
  const { theme, promotedCategory, importanceScore = 0, recallCount = 0 } = params
  const isFactLike = promotedCategory === 'IDENTITY'
    || FACT_CUE_PATTERNS.some((pattern) => pattern.test(theme))

  const factType: MemoryFactType = isFactLike ? 'FACT' : 'EPISODE'
  const base = factType === 'FACT' ? 0.7 : 0.56
  const confidence = Math.min(
    0.98,
    base + Math.min(0.16, importanceScore / 50) + Math.min(0.12, recallCount * 0.02),
  )

  return { factType, confidence }
}

export function shouldSupersedeFact(theme: string) {
  return CHANGE_CUE_PATTERNS.some((pattern) => pattern.test(theme))
}

export function buildComparableFactTerms(theme: string): string[] {
  const tokens = theme
    .toLowerCase()
    .match(/[가-힣a-z0-9]+/g) ?? []

  return [...new Set(tokens
    .map(normalizeFactToken)
    .filter((token) => token.length >= 2 && !FACT_STOPWORDS.has(token)))]
}

function normalizeFactToken(token: string) {
  return token.replace(KOREAN_PARTICLE_SUFFIX, '')
}

function inferFactSlot(theme: string): FactSlot {
  const tokens = theme
    .toLowerCase()
    .match(/[가-힣a-z0-9]+/g) ?? []
  const normalizedTokens = tokens.map(normalizeFactToken)
  const axes = new Set<FactAxis>()

  for (const rule of FACT_AXIS_PATTERNS) {
    if (rule.pattern.test(theme)) {
      axes.add(rule.axis)
    }
  }

  let objectHead: string | null = null
  const preferenceCueIndex = tokens.findIndex((token) => /좋아|좋아해|좋아하는|선호|싫어|싫어해/.test(token))
  if (preferenceCueIndex >= 0) {
    const explicitSlot = normalizedTokens
      .slice(preferenceCueIndex + 1)
      .find((token) => token.length >= 2 && !FACT_STOPWORDS.has(token))
    const implicitObject = [...normalizedTokens.slice(0, preferenceCueIndex)]
      .reverse()
      .find((token) => token.length >= 2 && !FACT_STOPWORDS.has(token))
    objectHead = explicitSlot ?? implicitObject ?? null
  }

  return { axes, objectHead }
}

function hasSharedAxis(left: FactSlot, right: FactSlot) {
  if (left.axes.size === 0 || right.axes.size === 0) {
    return false
  }
  return [...left.axes].some((axis) => right.axes.has(axis))
}

function areFactSlotsCompatible(current: FactSlot, candidate: FactSlot, overlap: number) {
  if (!hasSharedAxis(current, candidate)) {
    return false
  }
  if (current.objectHead && candidate.objectHead) {
    return current.objectHead === candidate.objectHead
  }
  return overlap >= 2
}

export function chooseSupersedeCandidate(
  currentTheme: string,
  candidates: SupersedeCandidateRow[],
): SupersedeCandidateRow | null {
  if (candidates.length === 0 || !shouldSupersedeFact(currentTheme)) {
    return null
  }

  const currentTerms = buildComparableFactTerms(currentTheme)
  if (currentTerms.length === 0) {
    return null
  }

  let best: { row: SupersedeCandidateRow; overlap: number } | null = null
  const currentSlot = inferFactSlot(currentTheme)

  for (const row of candidates) {
    const candidateTerms = new Set(buildComparableFactTerms(row.theme))
    const overlap = currentTerms.filter((term) => candidateTerms.has(term)).length
    const candidateSlot = inferFactSlot(row.theme)
    if (!areFactSlotsCompatible(currentSlot, candidateSlot, overlap)) {
      continue
    }
    if (!best || overlap > best.overlap || (overlap === best.overlap && row.createdAt > best.row.createdAt)) {
      best = { row, overlap }
    }
  }

  return best?.row ?? null
}

export function buildActiveMemoryWhere(now: Date = new Date()): Prisma.AiMemoryWhereInput {
  return {
    OR: [
      {
        AND: [
          { invalidatedAt: null },
          {
            OR: [
              { factType: null },
              { factType: { not: 'FACT' } },
            ],
          },
        ],
      },
      {
        AND: [
          { invalidatedAt: null },
          { factType: 'FACT' },
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { validTo: null },
          { supersededById: null },
        ],
      },
    ],
  }
}

function toTimestamp(value?: Date | string | null): number | null {
  if (!value) return null
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export function isMemorySnapshotActive(
  memory: MemoryTemporalSnapshot,
  now: Date = new Date(),
): boolean {
  const nowTimestamp = now.getTime()
  const validFrom = toTimestamp(memory.validFrom)
  const validTo = toTimestamp(memory.validTo)

  if (memory.invalidatedAt) return false
  if (memory.factType !== 'FACT') return true

  return (
    !memory.supersededById &&
    (validFrom === null || validFrom <= nowTimestamp) &&
    (validTo === null || validTo > nowTimestamp)
  )
}

export function buildActiveMemorySql(alias: string) {
  return `(
    ${alias}.invalidated_at IS NULL
    AND (
      ${alias}.fact_type IS NULL
      OR ${alias}.fact_type <> 'FACT'
      OR (
        ${alias}.fact_type = 'FACT'
        AND (${alias}.valid_from IS NULL OR ${alias}.valid_from <= NOW())
        AND ${alias}.valid_to IS NULL
        AND ${alias}.superseded_by_id IS NULL
      )
    )
  )`
}
