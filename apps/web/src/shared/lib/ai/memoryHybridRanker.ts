type HybridRankableMemory = {
  id: string
  theme: string
  communitySummary?: string | null
  createdAt?: Date | string | null
  importanceScore?: number | null
  vectorScore?: number | null
}

type HybridRankWeights = {
  vector: number
  lexical: number
  entity: number
  recency: number
  importance: number
}

type RankHybridMemoryParams<T extends HybridRankableMemory> = {
  queryText: string
  candidates: T[]
  limit: number
  recencyLambda?: number
  weights?: HybridRankWeights
  fallbackWeights?: HybridRankWeights
}

type RankedHybridMemory<T extends HybridRankableMemory> = T & {
  hybridScore: number
  lexicalScore: number
  entityScore: number
  recencyScore: number
  normalizedImportanceScore: number
  normalizedVectorScore: number
}

const DEFAULT_HYBRID_WEIGHTS: HybridRankWeights = {
  vector: 0.45,
  lexical: 0.25,
  entity: 0.17,
  recency: 0.08,
  importance: 0.05,
}

const DEFAULT_FALLBACK_WEIGHTS: HybridRankWeights = {
  vector: 0,
  lexical: 0.48,
  entity: 0.22,
  recency: 0.20,
  importance: 0.10,
}

const RRF_K = 60

const HYBRID_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'about',
  'your',
  'you',
  'are',
  'was',
  'were',
  'into',
  'just',
  'then',
  'than',
  'what',
  'when',
  'where',
  'while',
  'http',
  'https',
  'www',
  '있다',
  '하다',
  '했다',
  '하는',
  '해서',
  '에게',
  '에서',
  '으로',
  '이다',
  '였다',
  '그리고',
  '그런데',
  '정말',
  '너무',
  '지금',
  '최근',
  '오늘',
  '어제',
  '그냥',
  '같은',
  '대한',
  '관련',
  '대한',
])

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeHybridText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeHybridText(text: string): string[] {
  const normalized = normalizeHybridText(text)
  if (!normalized) return []

  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !HYBRID_STOPWORDS.has(token))
}

function pickEntityTerms(tokens: string[]): string[] {
  const seen = new Set<string>()
  const entities: string[] = []

  for (const token of tokens) {
    const isEntityLike =
      token.length >= 4 || /\d/.test(token) || /[가-힣]{2,}/.test(token)

    if (!isEntityLike || seen.has(token)) {
      continue
    }

    seen.add(token)
    entities.push(token)
  }

  return entities.slice(0, 8)
}

function normalizeImportanceScore(score?: number | null): number {
  if (!score || score <= 0) return 0
  if (score > 1) return clamp01(score / 10)
  return clamp01(score)
}

function normalizeDate(value?: Date | string | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function computeRecencyScore(createdAt: Date | string | null | undefined, lambda: number): number {
  const date = normalizeDate(createdAt)
  if (!date) return 0.5

  const ageHours = Math.max(0, (Date.now() - date.getTime()) / 3_600_000)
  return clamp01(Math.exp(-1 * lambda * ageHours))
}

function computeLexicalScore(queryTokens: string[], memoryTokens: string[]): number {
  if (queryTokens.length === 0 || memoryTokens.length === 0) return 0

  const memoryTokenSet = new Set(memoryTokens)
  const overlapCount = queryTokens.filter((token) => memoryTokenSet.has(token)).length
  return clamp01(overlapCount / queryTokens.length)
}

function computeEntityScore(entityTerms: string[], haystack: string): number {
  if (entityTerms.length === 0 || !haystack) return 0

  const matchCount = entityTerms.filter((term) => haystack.includes(term)).length
  return clamp01(matchCount / entityTerms.length)
}

function mergeUniqueHybridCandidates<T extends HybridRankableMemory>(candidates: T[]): T[] {
  const byId = new Map<string, T>()

  for (const candidate of candidates) {
    const existing = byId.get(candidate.id)
    if (!existing) {
      byId.set(candidate.id, candidate)
      continue
    }

    byId.set(candidate.id, {
      ...candidate,
      ...existing,
      vectorScore: Math.max(existing.vectorScore ?? 0, candidate.vectorScore ?? 0),
      importanceScore: existing.importanceScore ?? candidate.importanceScore,
      communitySummary: existing.communitySummary ?? candidate.communitySummary,
      createdAt: existing.createdAt ?? candidate.createdAt,
    })
  }

  return [...byId.values()]
}

function buildRankMap<T extends { id: string }>(
  candidates: T[],
  getScore: (candidate: T) => number,
): Map<string, number> | null {
  const maxScore = candidates.reduce((max, candidate) => Math.max(max, getScore(candidate)), 0)
  if (maxScore <= 0) {
    return null
  }

  const sorted = [...candidates].sort((a, b) => {
    const scoreDiff = getScore(b) - getScore(a)
    if (scoreDiff !== 0) return scoreDiff
    return a.id.localeCompare(b.id)
  })

  return new Map(sorted.map((candidate, index) => [candidate.id, index + 1]))
}

function computeRrfScore(id: string, ranks: Array<{ map: Map<string, number> | null; weight: number }>) {
  return ranks.reduce((score, rank) => {
    if (!rank.map || rank.weight <= 0) {
      return score
    }
    const position = rank.map.get(id)
    return position ? score + rank.weight / (RRF_K + position) : score
  }, 0)
}

export function rankHybridMemoryCandidates<T extends HybridRankableMemory>(
  params: RankHybridMemoryParams<T>,
): RankedHybridMemory<T>[] {
  const {
    queryText,
    candidates,
    limit,
    recencyLambda = 0.01,
    weights = DEFAULT_HYBRID_WEIGHTS,
    fallbackWeights = DEFAULT_FALLBACK_WEIGHTS,
  } = params

  const uniqueCandidates = mergeUniqueHybridCandidates(candidates)
  const queryTokens = tokenizeHybridText(queryText)
  const entityTerms = pickEntityTerms(queryTokens)
  const useVectorWeights = uniqueCandidates.some((candidate) => (candidate.vectorScore ?? 0) > 0)
  const activeWeights = useVectorWeights ? weights : fallbackWeights

  const scoredCandidates = uniqueCandidates.map((candidate) => {
    const haystack = normalizeHybridText(
      [candidate.theme, candidate.communitySummary].filter(Boolean).join(' '),
    )
    const lexicalScore = computeLexicalScore(queryTokens, tokenizeHybridText(haystack))
    const entityScore = computeEntityScore(entityTerms, haystack)
    const recencyScore = computeRecencyScore(candidate.createdAt, recencyLambda)
    const normalizedImportanceScore = normalizeImportanceScore(candidate.importanceScore)
    const normalizedVectorScore = clamp01(candidate.vectorScore ?? 0)

    return {
      ...candidate,
      hybridScore: 0,
      lexicalScore,
      entityScore,
      recencyScore,
      normalizedImportanceScore,
      normalizedVectorScore,
    }
  })

  const ranks = [
    { map: buildRankMap(scoredCandidates, (candidate) => candidate.normalizedVectorScore), weight: activeWeights.vector },
    { map: buildRankMap(scoredCandidates, (candidate) => candidate.lexicalScore), weight: activeWeights.lexical },
    { map: buildRankMap(scoredCandidates, (candidate) => candidate.entityScore), weight: activeWeights.entity },
    { map: buildRankMap(scoredCandidates, (candidate) => candidate.recencyScore), weight: activeWeights.recency },
    { map: buildRankMap(scoredCandidates, (candidate) => candidate.normalizedImportanceScore), weight: activeWeights.importance },
  ]

  return scoredCandidates
    .map((candidate) => ({
      ...candidate,
      hybridScore: computeRrfScore(candidate.id, ranks),
    }))
    .sort((a, b) => {
      if (b.hybridScore !== a.hybridScore) return b.hybridScore - a.hybridScore
      if (b.lexicalScore !== a.lexicalScore) return b.lexicalScore - a.lexicalScore
      if (b.entityScore !== a.entityScore) return b.entityScore - a.entityScore
      if (b.normalizedVectorScore !== a.normalizedVectorScore) {
        return b.normalizedVectorScore - a.normalizedVectorScore
      }

      const aDate = normalizeDate(a.createdAt)?.getTime() ?? 0
      const bDate = normalizeDate(b.createdAt)?.getTime() ?? 0
      return bDate - aDate
    })
    .slice(0, limit)
}
