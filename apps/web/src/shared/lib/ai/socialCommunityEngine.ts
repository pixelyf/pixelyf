/**
 * [Social Community Engine]
 * Soul 간 상호작용 그래프에 Louvain 커뮤니티 감지를 적용합니다.
 *
 * 실행 주기: DEEP Reflection 배치 (2주 1회)
 * 선행 인프라: 14번 설계서 memoryGraphEngine.ts와 동일 패턴
 *
 * 1. ai_moments에서 COMMENT/PING/TOUCH 이력 집계 → Soul 간 가중 엣지
 * 2. graphology Louvain으로 Soul 커뮤니티 감지
 * 3. ai_soul_bonds.social_community_id 업데이트
 */

import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import prisma from '@/shared/lib/prisma'

const MIN_INTERACTIONS = 2   // 엣지 생성 최소 상호작용 횟수
const MIN_SOULS_FOR_GRAPH = 3 // 최소 Soul 수

export interface SocialCommunityResult {
  totalSouls: number
  communities: number
  bondsUpdated: number
}

export async function rebuildSocialCommunities(): Promise<SocialCommunityResult> {
  // 1. 최근 30일 상호작용 이력 집계
  const interactions = await prisma.$queryRawUnsafe<{
    soul_a: string
    soul_b: string
    weight: number
  }[]>(
    `SELECT m.soul_id as soul_a,
            m.target_soul_id as soul_b,
            COUNT(*)::int as weight
     FROM ai_moments m
     WHERE m.target_soul_id IS NOT NULL
       AND m.action_type IN ('COMMENT', 'PING', 'TOUCH')
       AND m.created_at > NOW() - INTERVAL '30 days'
     GROUP BY m.soul_id, m.target_soul_id
     HAVING COUNT(*) >= ${MIN_INTERACTIONS}`
  )

  // 고유 Soul ID 추출
  const soulIds = new Set<string>()
  interactions.forEach(i => {
    soulIds.add(i.soul_a)
    soulIds.add(i.soul_b)
  })

  if (soulIds.size < MIN_SOULS_FOR_GRAPH) {
    return { totalSouls: soulIds.size, communities: 0, bondsUpdated: 0 }
  }

  // 2. graphology 그래프 구축
  const graph = new Graph({ type: 'undirected' })

  soulIds.forEach(id => graph.addNode(id))

  interactions.forEach(i => {
    const key = [i.soul_a, i.soul_b].sort().join('_')
    if (graph.hasEdge(key)) {
      // 양방향 상호작용 가산
      graph.updateEdgeAttribute(key, 'weight', (w: number) => w + i.weight)
    } else {
      try {
        graph.addEdgeWithKey(key, i.soul_a, i.soul_b, { weight: i.weight })
      } catch {
        // 중복 엣지 무시
      }
    }
  })

  // 3. Louvain 커뮤니티 감지
  const communities = louvain(graph, { resolution: 1.0 })
  const communityCount = new Set(Object.values(communities)).size

  // 4. ai_soul_bonds 업데이트
  let bondsUpdated = 0

  for (const [soulId, communityId] of Object.entries(communities)) {
    // 이 Soul이 참여한 모든 Bond에 communityId 기록
    const result = await prisma.aiSoulBond.updateMany({
      where: {
        OR: [{ soulAId: soulId }, { soulBId: soulId }],
        status: 'connected',
      },
      data: { socialCommunityId: Number(communityId) },
    })
    bondsUpdated += result.count
  }

  console.log(`[SocialCommunity] ${soulIds.size}개 Soul → ${communityCount}개 커뮤니티 감지, ${bondsUpdated}개 Bond 업데이트`)

  return { totalSouls: soulIds.size, communities: communityCount, bondsUpdated }
}
