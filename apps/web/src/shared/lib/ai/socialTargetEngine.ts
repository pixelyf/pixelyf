/**
 * [v3 Social Targeting Engine]
 * Bond 친밀도 + 관심사 유사도 + 트렌딩 기반 교류 대상 탐색.
 * heartbeat의 기존 findFirst(최근 글 1건)를 대체합니다.
 *
 * 탐색 우선순위 (가중 랜덤):
 *   1. Bond connected 아바타의 최근 POST → 40%
 *   2. interest_tags 겹침 아바타의 POST → 30%
 *   3. trendingScore 상위 POST → 20%
 *   4. 랜덤 폴백 (기존 로직) → 10%
 *
 * 설계 출처: docs/2_AI_은하_설계/3_뉴런_알고리즘_설계서_v3_v4.md Part B
 */

import prisma from '@/shared/lib/prisma'

// ─── 타입 ────────────────────────────────────────────────────

export interface SocialTarget {
  momentId: string
  momentContent: string
  targetSoulId: string
  selectionReason: 'SAME_COMMUNITY' | 'BOND' | 'INTEREST' | 'TRENDING' | 'CROSS_COMMUNITY'
}

// ─── 상수 ────────────────────────────────────────────────────

/** 각 소스별 가중치 (합계 = 1.0) */
const SOURCE_WEIGHTS = {
  SAME_COMMUNITY: 0.25,  // 소셜 커뮤니티 우선도 조정
  BOND: 0.20,            // 기존 연결 고리
  INTEREST: 0.30,        // [3번] 관심사 태그 겹침 30% 복구
  TRENDING: 0.15,        // 화제의 글
  CROSS_COMMUNITY: 0.10, // 다른 커뮤니티 교류
} as const

/** 최근 POST 조회 시간 범위 (24시간) */
const RECENT_HOURS = 24

/** 각 소스별 최대 조회 건수 */
const FETCH_LIMIT = 5

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * Bond 기반 사회적 교류 대상을 탐색합니다.
 *
 * @param soulId 현재 아바타의 Soul ID
 * @param interestTags 현재 아바타의 관심사 태그 배열
 * @returns 교류 대상 또는 null (대상이 전혀 없을 경우)
 */
export async function findSocialTarget(
  soulId: string,
): Promise<SocialTarget | null> {
  const since = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000)

  // 1. 현재 아바타의 유저 ID 조회 및 관심사 태그 자율 조회 (상위 route.ts 영향성 최소화)
  const soul = await prisma.aiSoul.findUnique({
    where: { id: soulId },
    select: { userId: true }
  })

  let interestTags: string[] = []
  if (soul?.userId) {
    const myPersona = await prisma.userPersona.findUnique({
      where: { user_id: soul.userId },
      select: { interest_tags: true }
    })
    interestTags = myPersona?.interest_tags || []
  }

  // 2. 관심사를 포함하여 5개 소스를 병렬로 조회
  const [
    communityCandidates,
    bondCandidates,
    interestCandidates,
    trendingCandidates,
    crossCandidates
  ] = await Promise.all([
    fetchSameCommunity(soulId, since),
    fetchBondCandidates(soulId, since),
    fetchInterestCandidates(soulId, interestTags, since),
    fetchTrendingCandidates(soulId),
    fetchCrossCommunity(soulId, since),
  ])

  // 3. 가중 랜덤 선택
  return weightedSelect([
    { candidates: communityCandidates, reason: 'SAME_COMMUNITY' as const, weight: SOURCE_WEIGHTS.SAME_COMMUNITY },
    { candidates: bondCandidates, reason: 'BOND' as const, weight: SOURCE_WEIGHTS.BOND },
    { candidates: interestCandidates, reason: 'INTEREST' as const, weight: SOURCE_WEIGHTS.INTEREST },
    { candidates: trendingCandidates, reason: 'TRENDING' as const, weight: SOURCE_WEIGHTS.TRENDING },
    { candidates: crossCandidates, reason: 'CROSS_COMMUNITY' as const, weight: SOURCE_WEIGHTS.CROSS_COMMUNITY },
  ])
}

// ─── 소스별 후보 조회 ────────────────────────────────────────

/** 1. Bond connected 아바타의 최근 POST */
async function fetchBondCandidates(
  soulId: string,
  since: Date,
): Promise<CandidateMoment[]> {
  try {
    // connected 상태의 Bond에서 상대 Soul ID 추출
    const bonds = await prisma.aiSoulBond.findMany({
      where: {
        status: 'connected',
        OR: [
          { soulAId: soulId },
          { soulBId: soulId },
        ],
      },
      select: { soulAId: true, soulBId: true, resonanceScore: true },
      orderBy: { resonanceScore: 'desc' },
      take: 20,
    })

    if (bonds.length === 0) return []

    const connectedIds = bonds.map(b => b.soulAId === soulId ? b.soulBId : b.soulAId)

    // 해당 아바타의 최근 POST 조회
    const moments = await prisma.aiMoment.findMany({
      where: {
        soulId: { in: connectedIds },
        actionType: 'POST',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: FETCH_LIMIT,
      select: { id: true, content: true, soulId: true },
    })

    return moments.map(m => ({ momentId: m.id, content: m.content, soulId: m.soulId }))
  } catch {
    return []
  }
}

/** 2. interest_tags 겹침 아바타의 POST */
async function fetchInterestCandidates(
  soulId: string,
  interestTags: string[],
  since: Date,
): Promise<CandidateMoment[]> {
  if (interestTags.length === 0) return []

  try {
    // interest_tags가 겹치는 다른 아바타 탐색
    // Prisma에서 array overlap은 $queryRawUnsafe로 처리
    const matchingPersonas: { user_id: string }[] = await prisma.$queryRawUnsafe(`
      SELECT up.user_id
      FROM user_personas up
      JOIN ai_souls s ON s.user_id = up.user_id
      WHERE up.interest_tags && $1::text[]
        AND s.id != $2::uuid
      LIMIT 20
    `, interestTags, soulId)

    if (matchingPersonas.length === 0) return []

    const userIds = matchingPersonas.map(p => p.user_id)

    // 해당 유저의 AI Soul → 최근 POST
    const souls = await prisma.aiSoul.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    })

    if (souls.length === 0) return []

    const moments = await prisma.aiMoment.findMany({
      where: {
        soulId: { in: souls.map(s => s.id) },
        actionType: 'POST',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: FETCH_LIMIT,
      select: { id: true, content: true, soulId: true },
    })

    return moments.map(m => ({ momentId: m.id, content: m.content, soulId: m.soulId }))
  } catch {
    return []
  }
}

/** 3. trendingScore 상위 POST */
async function fetchTrendingCandidates(soulId: string): Promise<CandidateMoment[]> {
  try {
    const moments = await prisma.aiMoment.findMany({
      where: {
        soulId: { not: soulId },
        actionType: 'POST',
        trendingScore: { gt: 0 },
      },
      orderBy: { trendingScore: 'desc' },
      take: FETCH_LIMIT,
      select: { id: true, content: true, soulId: true },
    })

    return moments.map(m => ({ momentId: m.id, content: m.content, soulId: m.soulId }))
  } catch {
    return []
  }
}

/** 4. 랜덤 폴백 (기존 로직과 동일) */
async function fetchRandomCandidate(soulId: string): Promise<CandidateMoment | null> {
  try {
    const moment = await prisma.aiMoment.findFirst({
      where: { soulId: { not: soulId }, actionType: 'POST' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, content: true, soulId: true },
    })

    return moment ? { momentId: moment.id, content: moment.content, soulId: moment.soulId } : null
  } catch {
    return null
  }
}

// ─── 가중 랜덤 선택 ─────────────────────────────────────────

/** [15번] 같은 social_community_id를 가진 Soul의 최근 POST */
async function fetchSameCommunity(
  soulId: string,
  since: Date,
): Promise<CandidateMoment[]> {
  try {
    // 현재 Soul의 커뮤니티 ID 조회
    const myBond = await prisma.aiSoulBond.findFirst({
      where: {
        OR: [{ soulAId: soulId }, { soulBId: soulId }],
        status: 'connected',
        socialCommunityId: { not: null },
      },
      select: { socialCommunityId: true },
    })

    if (!myBond?.socialCommunityId) return []

    // 같은 커뮤니티의 다른 Soul ID 추출
    const sameCommunityBonds = await prisma.aiSoulBond.findMany({
      where: {
        socialCommunityId: myBond.socialCommunityId,
        status: 'connected',
      },
      select: { soulAId: true, soulBId: true },
    })

    const communityIds = new Set<string>()
    sameCommunityBonds.forEach(b => {
      communityIds.add(b.soulAId)
      communityIds.add(b.soulBId)
    })
    communityIds.delete(soulId) // 자기 자신 제외

    if (communityIds.size === 0) return []

    // 커뮤니티 멤버의 최근 POST 조회
    const moments = await prisma.aiMoment.findMany({
      where: {
        soulId: { in: [...communityIds] },
        actionType: 'POST',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: FETCH_LIMIT,
      select: { id: true, content: true, soulId: true },
    })

    return moments.map(m => ({ momentId: m.id, content: m.content, soulId: m.soulId }))
  } catch {
    return []
  }
}

/** [15번] 다른 커뮤니티 Soul의 POST (약한 연결 시뮬레이션) */
async function fetchCrossCommunity(
  soulId: string,
  since: Date,
): Promise<CandidateMoment[]> {
  try {
    const myBond = await prisma.aiSoulBond.findFirst({
      where: {
        OR: [{ soulAId: soulId }, { soulBId: soulId }],
        status: 'connected',
        socialCommunityId: { not: null },
      },
      select: { socialCommunityId: true },
    })

    if (!myBond?.socialCommunityId) return []

    // 다른 커뮤니티의 Soul 중 최근 POST
    const otherBonds = await prisma.aiSoulBond.findMany({
      where: {
        socialCommunityId: { not: myBond.socialCommunityId },
        status: 'connected',
      },
      select: { soulAId: true, soulBId: true },
      take: 20,
    })

    const otherIds = new Set<string>()
    otherBonds.forEach(b => {
      otherIds.add(b.soulAId)
      otherIds.add(b.soulBId)
    })

    if (otherIds.size === 0) return []

    const moments = await prisma.aiMoment.findMany({
      where: {
        soulId: { in: [...otherIds] },
        actionType: 'POST',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, content: true, soulId: true },
    })

    return moments.map(m => ({ momentId: m.id, content: m.content, soulId: m.soulId }))
  } catch {
    return []
  }
}

interface CandidateMoment {
  momentId: string
  content: string
  soulId: string
}

interface WeightedSource {
  candidates: CandidateMoment[]
  reason: SocialTarget['selectionReason']
  weight: number
}

/**
 * 가중 랜덤으로 소스를 선택하고, 해당 소스 내에서 랜덤으로 1건 반환.
 * 비어있는 소스는 가중치를 재분배합니다.
 */
function weightedSelect(sources: WeightedSource[]): SocialTarget | null {
  // 후보가 있는 소스만 필터
  const available = sources.filter(s => s.candidates.length > 0)
  if (available.length === 0) return null

  // 가중치 재분배 (비어있는 소스의 가중치를 나머지에 비례 배분)
  const totalWeight = available.reduce((sum, s) => sum + s.weight, 0)
  const normalized = available.map(s => ({ ...s, weight: s.weight / totalWeight }))

  // 가중 랜덤 선택
  const roll = Math.random()
  let cumulative = 0

  for (const source of normalized) {
    cumulative += source.weight
    if (roll <= cumulative) {
      const pick = source.candidates[Math.floor(Math.random() * source.candidates.length)]
      return {
        momentId: pick.momentId,
        momentContent: pick.content,
        targetSoulId: pick.soulId,
        selectionReason: source.reason,
      }
    }
  }

  // 폴백 (부동소수점 오차 방지)
  const last = normalized[normalized.length - 1]
  const pick = last.candidates[0]
  return {
    momentId: pick.momentId,
    momentContent: pick.content,
    targetSoulId: pick.soulId,
    selectionReason: last.reason,
  }
}
