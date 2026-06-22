export const MEMORY_EVAL_DATASET_VERSION = '2026-06-19-phase6-runtime-ranking'

export type MemoryEvalCandidate = {
  id: string
  theme: string
  communitySummary?: string | null
  importanceScore?: number | null
  vectorScore?: number | null
  factType?: string | null
  validFrom?: string | null
  validTo?: string | null
  supersededById?: string | null
  invalidatedAt?: string | null
}

export type MemoryEvalFixture = {
  id: string
  query: string
  evaluatedAt: string
  limit: number
  expectedMemoryIds: string[]
  staleMemoryIds: string[]
  candidates: MemoryEvalCandidate[]
  contradictionPairs: Array<[string, string]>
}

export const MEMORY_EVAL_FIXTURES: MemoryEvalFixture[] = [
  {
    id: 'owner-fact-supersede',
    query: '요즘 주인이 좋아하는 음료',
    evaluatedAt: '2026-06-19T00:00:00.000Z',
    limit: 1,
    expectedMemoryIds: ['mem-latest-coffee'],
    staleMemoryIds: ['mem-old-tea'],
    candidates: [
      {
        id: 'mem-latest-coffee',
        theme: '요즘 주인이 가장 좋아하는 음료는 커피다',
        importanceScore: 0.8,
        vectorScore: 0.82,
        factType: 'FACT',
        validFrom: '2026-06-10T00:00:00.000Z',
      },
      {
        id: 'mem-old-tea',
        theme: '주인이 가장 좋아하는 음료는 홍차다',
        importanceScore: 0.9,
        vectorScore: 0.94,
        factType: 'FACT',
        validFrom: '2026-05-01T00:00:00.000Z',
        validTo: '2026-06-10T00:00:00.000Z',
        supersededById: 'mem-latest-coffee',
      },
      {
        id: 'mem-unrelated-walk',
        theme: '주인은 저녁 산책을 즐긴다',
        importanceScore: 0.4,
        vectorScore: 0.35,
      },
    ],
    contradictionPairs: [['mem-latest-coffee', 'mem-old-tea']],
  },
  {
    id: 'visitor-query-disambiguation',
    query: '방문자 B와 최근 나눈 전시회 대화',
    evaluatedAt: '2026-06-19T00:00:00.000Z',
    limit: 1,
    expectedMemoryIds: ['mem-visitor-b-chat'],
    staleMemoryIds: [],
    candidates: [
      {
        id: 'mem-visitor-b-chat',
        theme: '방문자 B와 현대 미술 전시회 일정에 관해 대화했다',
        importanceScore: 0.6,
        vectorScore: 0.78,
      },
      {
        id: 'mem-visitor-a-chat',
        theme: '방문자 A와 주말 등산 계획에 관해 대화했다',
        importanceScore: 0.7,
        vectorScore: 0.42,
      },
    ],
    contradictionPairs: [],
  },
  {
    id: 'lexical-rescue-with-invalidated-candidate',
    query: '공개 프로필의 별자리 관찰 취미',
    evaluatedAt: '2026-06-19T00:00:00.000Z',
    limit: 1,
    expectedMemoryIds: ['mem-owner-public-stargazing'],
    staleMemoryIds: ['mem-owner-private-invalidated'],
    candidates: [
      {
        id: 'mem-owner-public-stargazing',
        theme: '공개 프로필에는 별자리 관찰이 취미라고 기록되어 있다',
        importanceScore: 0.7,
        vectorScore: 0.68,
      },
      {
        id: 'mem-owner-private-invalidated',
        theme: '공개 프로필의 별자리 관찰 취미에 관한 오래된 비공개 기록',
        importanceScore: 1,
        vectorScore: 0.96,
        invalidatedAt: '2026-06-15T00:00:00.000Z',
      },
      {
        id: 'mem-owner-public-music',
        theme: '공개 프로필에는 재즈 감상이 취미라고 기록되어 있다',
        importanceScore: 0.5,
        vectorScore: 0.5,
      },
    ],
    contradictionPairs: [],
  },
]
