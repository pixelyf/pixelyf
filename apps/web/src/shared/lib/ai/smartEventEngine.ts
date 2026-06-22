/**
 * [v3 Smart Event Engine]
 * 커뮤니티 활동이 현재 아바타의 Need에 미치는 영향을 계산합니다.
 * The Sims의 "Advertisement" 패턴을 차용합니다.
 *
 * 규칙:
 *   - 친한 아바타(Bond connected)가 POST → socialNeed +0.05
 *   - 누군가 나에게 COMMENT → expressionNeed +0.03, socialNeed +0.05
 *   - 나에게 PING → socialNeed +0.08
 *   - 커뮤니티 전체 활동이 많은 시간대 → 전체 Need 활성화 계수 ×1.2
 *   - 커뮤니티 전체 활동이 적은 시간대 → restNeed +0.03
 *
 * 설계 출처: docs/2_AI_은하_설계/3_뉴런_알고리즘_설계서_v3_v4.md Part B
 */

import prisma from '@/shared/lib/prisma'

// ─── 타입 ────────────────────────────────────────────────────

export interface SmartEventResult {
  /** Need 부스트량 (heartbeat에서 tickedNeed에 합산) */
  needBoost: {
    expressionNeed: number
    socialNeed: number
    reflectionNeed: number
    restNeed: number
  }
  /** 자극 원인 설명 (디버그 + 시나리오 컨텍스트용) */
  triggers: string[]
}

// ─── 상수 ────────────────────────────────────────────────────

/** 최근 자극 감지 범위 (1시간) */
const STIMULUS_WINDOW_MS = 60 * 60 * 1000

/** 커뮤니티 활발 판정 기준 (동시 활동 Soul 수) */
const COMMUNITY_ACTIVE_THRESHOLD = 3

/** 부스트 수치 */
const BOOST = {
  BOND_POST_SOCIAL: 0.05,
  COMMENT_EXPRESSION: 0.03,
  COMMENT_SOCIAL: 0.05,
  PING_SOCIAL: 0.08,
  COMMUNITY_ACTIVE_MULTIPLIER: 1.2,
  COMMUNITY_QUIET_REST: 0.03,
} as const

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 커뮤니티 활동이 현재 아바타의 Need에 미치는 영향을 계산합니다.
 *
 * @param soulId 현재 아바타의 Soul ID
 * @param hour 현재 시각 (0-23)
 * @returns Need 부스트량과 자극 원인 목록
 */
export async function evaluateSmartEvents(
  soulId: string,
  _hour: number,
): Promise<SmartEventResult> {
  const since = new Date(Date.now() - STIMULUS_WINDOW_MS)
  const boost = { expressionNeed: 0, socialNeed: 0, reflectionNeed: 0, restNeed: 0 }
  const triggers: string[] = []

  // 3개 자극 소스를 병렬 조회
  const [bondActivity, incomingInteractions, communityActivity] = await Promise.all([
    detectBondActivity(soulId, since),
    detectIncomingInteractions(soulId, since),
    detectCommunityActivity(soulId, since),
  ])

  // 1. 친한 아바타(Bond connected)가 POST
  if (bondActivity.count > 0) {
    const communityMultiplier = bondActivity.sameCommunity ? 1.5 : 1.0
    boost.socialNeed += BOOST.BOND_POST_SOCIAL * Math.min(bondActivity.count, 3) * communityMultiplier
    triggers.push(`친한 아바타 ${bondActivity.count}명이 최근 글을 씀`)
    if (bondActivity.sameCommunity) {
      triggers.push('같은 커뮤니티 활동 → 부스트 ×1.5')
    }
  }

  // 2. 나에게 COMMENT 도착
  if (incomingInteractions.comments > 0) {
    boost.expressionNeed += BOOST.COMMENT_EXPRESSION * Math.min(incomingInteractions.comments, 3)
    boost.socialNeed += BOOST.COMMENT_SOCIAL * Math.min(incomingInteractions.comments, 3)
    triggers.push(`내 글에 댓글 ${incomingInteractions.comments}건 도착`)
  }

  // 3. 나에게 PING 도착
  if (incomingInteractions.pings > 0) {
    boost.socialNeed += BOOST.PING_SOCIAL * Math.min(incomingInteractions.pings, 3)
    triggers.push(`핑 ${incomingInteractions.pings}건 수신`)
  }

  // 4. 커뮤니티 활발/비활발 판정
  if (communityActivity.activeSouls >= COMMUNITY_ACTIVE_THRESHOLD) {
    // 활발 시간대: 기존 부스트 ×1.2 + 최소 보장 부스트 (부스트가 0이어도 자극 전달)
    const minBoost = 0.02
    boost.expressionNeed = Math.max(minBoost, boost.expressionNeed) * BOOST.COMMUNITY_ACTIVE_MULTIPLIER
    boost.socialNeed = Math.max(minBoost, boost.socialNeed) * BOOST.COMMUNITY_ACTIVE_MULTIPLIER
    boost.reflectionNeed = Math.max(minBoost, boost.reflectionNeed) * BOOST.COMMUNITY_ACTIVE_MULTIPLIER
    triggers.push(`커뮤니티 활발 (${communityActivity.activeSouls}명 동시 활동)`)
  } else if (communityActivity.activeSouls === 0) {
    // 비활발 시간대: restNeed 증가
    boost.restNeed += BOOST.COMMUNITY_QUIET_REST
    triggers.push('커뮤니티 조용 → 휴식 유도')
  }

  // 모든 부스트를 0~0.3으로 클램프 (과도한 부스트 방지)
  boost.expressionNeed = Math.min(0.3, Math.max(0, boost.expressionNeed))
  boost.socialNeed = Math.min(0.3, Math.max(0, boost.socialNeed))
  boost.reflectionNeed = Math.min(0.3, Math.max(0, boost.reflectionNeed))
  boost.restNeed = Math.min(0.3, Math.max(0, boost.restNeed))

  return { needBoost: boost, triggers }
}

// ─── 자극 감지 함수 ──────────────────────────────────────────

/** 친한 아바타(Bond connected)의 최근 POST 감지 */
async function detectBondActivity(
  soulId: string,
  since: Date,
): Promise<{ count: number; sameCommunity: boolean }> {
  try {
    const bonds = await prisma.aiSoulBond.findMany({
      where: {
        status: 'connected',
        OR: [{ soulAId: soulId }, { soulBId: soulId }],
      },
      select: { soulAId: true, soulBId: true, socialCommunityId: true },
    })

    if (bonds.length === 0) return { count: 0, sameCommunity: false }

    const connectedIds = bonds.map(b => b.soulAId === soulId ? b.soulBId : b.soulAId)

    const activePosters = await prisma.aiMoment.findMany({
      where: {
        soulId: { in: connectedIds },
        actionType: 'POST',
        createdAt: { gte: since },
      },
      select: { soulId: true },
    })

    const count = activePosters.length
    const posterIds = new Set(activePosters.map(p => p.soulId))

    // 포스터 중 나와 같은 커뮤니티에 속한(본드에 socialCommunityId가 있는) 사람이 있는지 대조
    const sameCommunityBond = bonds.find(b => {
      const otherId = b.soulAId === soulId ? b.soulBId : b.soulAId
      return b.socialCommunityId != null && posterIds.has(otherId)
    })
    const sameCommunity = !!sameCommunityBond

    return { count, sameCommunity }
  } catch {
    return { count: 0, sameCommunity: false }
  }
}

/** 나에게 도착한 COMMENT/PING 감지 */
async function detectIncomingInteractions(
  soulId: string,
  since: Date,
): Promise<{ comments: number; pings: number }> {
  try {
    const [comments, pings] = await Promise.all([
      prisma.aiMoment.count({
        where: {
          targetSoulId: soulId,
          actionType: 'COMMENT',
          createdAt: { gte: since },
        },
      }),
      prisma.aiMoment.count({
        where: {
          targetSoulId: soulId,
          actionType: 'PING',
          createdAt: { gte: since },
        },
      }),
    ])

    return { comments, pings }
  } catch {
    return { comments: 0, pings: 0 }
  }
}

/** 커뮤니티 전체 활동 수준 감지 */
async function detectCommunityActivity(
  soulId: string,
  since: Date,
): Promise<{ activeSouls: number }> {
  try {
    // 최근 1시간 내 활동한 고유 Soul 수 (자기 제외)
    const result = await prisma.aiMoment.groupBy({
      by: ['soulId'],
      where: {
        soulId: { not: soulId },
        createdAt: { gte: since },
      },
    })

    return { activeSouls: result.length }
  } catch {
    return { activeSouls: 0 }
  }
}
