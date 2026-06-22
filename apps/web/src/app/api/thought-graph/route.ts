/**
 * [생각그래프] GET /api/thought-graph — 노드 + 엣지 조회
 * 
 * Query Params:
 *   galaxyKey: string — 현재 은하 키 (기본 은하 및 활성 은하)
 *   scope: 'all' | 'mine' — 전체 은하 / 내 은하
 * 
 * [Edge-First Query 전략]
 * 설계 문서 76번 L139: "인위적인 노드 수 제한은 불필요합니다"
 * 기존 take:500 노드-먼저 방식은 엣지 99.93% 손실 → 엣지-먼저 전략으로 전환.
 * 
 * Phase 1: 엣지 우선 조회 (MAX_EDGES 제한)
 * Phase 2: 연결된 모먼트 ID 수집 → 데이터 일괄 조회
 * Phase 3: 고립 노드 보충 (MAX_NODES - 연결 노드 수)
 * Phase 4: 1:N 수렴 + 엣지 리매핑 (기존 로직)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import type { ThoughtNodeData, ThoughtEdge, ThoughtGraphResponse } from '@/shared/lib/thought-graph/types'

// 76번 성능 백서 기준: Barnes-Hut O(N log N) → 2,000노드 물리 연산 ~3ms (16.6ms 프레임 버짓 안전)
// 단일 PIXI.Graphics 배치 렌더링 → 엣지 10,000개도 드로우콜 1개
const MAX_EDGES = 2000
const MAX_NODES = 2000

// 공통 모먼트 select 필드 (요청된 locale에 맞춰 completed 번역본을 동적으로 select)
const getMomentSelect = (locale: string) => ({
  id: true,
  user_id: true,
  content: true,
  summary: true,
  category: true,
  galaxy_key: true,
  mood_id: true,
  created_at: true,
  is_deleted: true,
  user: {
    select: {
      display_name: true,
      avatar_image_url: true,
    },
  },
  translations: {
    where: {
      locale: locale,
      status: 'completed',
    },
    select: {
      content: true,
    },
  },
} as const)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const galaxyKey = searchParams.get('galaxyKey')
    const scope = searchParams.get('scope') || 'all'
    const locale = searchParams.get('locale') || 'ko'

    if (!galaxyKey) {
      return NextResponse.json({ error: 'galaxyKey is required' }, { status: 400 })
    }

    // 인증 확인
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))

    // '내 생각' 스코프인데 비회원인 경우에만 선택적 차단
    if (scope === 'mine' && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Phase 1: Edge-First Query — 엣지 우선 조회 ──
    // 관계선을 먼저 가져와서 연결 그래프의 무결성을 보장합니다.
    const edgeSourceFilter: any = {
      galaxy_key: galaxyKey,
      is_deleted: false,
    }
    const edgeTargetFilter: any = {
      galaxy_key: galaxyKey,
      is_deleted: false,
    }

    if (scope === 'mine' && user) {
      edgeSourceFilter.user_id = user.id
      edgeTargetFilter.user_id = user.id
    }

    const relationships = await prisma.momentRelationship.findMany({
      where: {
        status: { not: 'rejected' },
        source_moment: edgeSourceFilter,
        target_moment: edgeTargetFilter,
      },
      select: {
        id: true,
        source_moment_id: true,
        target_moment_id: true,
        relation_type: true,
        weight: true,
        created_by: true,
        status: true,
      },
      take: MAX_EDGES,
    })

    // ── Phase 2: 연결된 모먼트 ID 수집 + 데이터 일괄 조회 ──
    const connectedMomentIds = new Set<string>()
    relationships.forEach(r => {
      connectedMomentIds.add(r.source_moment_id)
      connectedMomentIds.add(r.target_moment_id)
    })

    const connectedMoments = connectedMomentIds.size > 0
      ? await prisma.moment.findMany({
          where: {
            id: { in: Array.from(connectedMomentIds) },
            is_deleted: false,
          },
          select: getMomentSelect(locale),
        })
      : []

    // ── Phase 3: 고립 노드 보충 (잔여 용량만큼 최신순 채우기) ──
    const remainingCapacity = Math.max(0, MAX_NODES - connectedMoments.length)

    const isolatedWhere: any = {
      galaxy_key: galaxyKey,
      is_deleted: false,
    }
    if (connectedMomentIds.size > 0) {
      isolatedWhere.id = { notIn: Array.from(connectedMomentIds) }
    }
    if (scope === 'mine' && user) {
      isolatedWhere.user_id = user.id
    }

    const isolatedMoments = remainingCapacity > 0
      ? await prisma.moment.findMany({
          where: isolatedWhere,
          select: getMomentSelect(locale),
          orderBy: { created_at: 'desc' },
          take: remainingCapacity,
        })
      : []

    // 연결 노드 + 고립 노드 합산
    const moments = [...connectedMoments, ...isolatedMoments]

    // ── Phase 4: [1:N 시맨틱 수렴] 임베딩 벡터 코사인 유사도 + Union-Find 그룹핑 ──
    // [PERF GUARD] 임베딩 로드 + O(n²) 클러스터링은 500노드 이하에서만 수행
    // 2000노드 × 768d 임베딩 로드(~12MB JSON.parse)만으로도 수 초 소요 → scope=all 타임아웃 원인
    const MAX_CLUSTER_NODES = 500
    const momentIds = moments.map(m => m.id)
    const shouldCluster = momentIds.length <= MAX_CLUSTER_NODES

    const embeddingMap = new Map<string, number[]>()
    if (shouldCluster && momentIds.length > 0) {
      const momentsWithEmbeddings: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, embedding::text FROM moments WHERE id = ANY($1::uuid[]) AND embedding IS NOT NULL`,
        momentIds
      )
      momentsWithEmbeddings.forEach(row => {
        try {
          if (row.embedding) {
            const parsed = JSON.parse(row.embedding)
            if (Array.isArray(parsed) && parsed.length === 768) {
              embeddingMap.set(row.id, parsed)
            }
          }
        } catch (e) {
          console.warn(`[ThoughtGraph] 임베딩 파싱 에러: momentId=${row.id}`, e)
        }
      })
    } else if (!shouldCluster) {
      console.log(`[ThoughtGraph] 임베딩 로드 스킵: ${momentIds.length}노드 > ${MAX_CLUSTER_NODES} (클러스터링 불필요)`)
    }

    const dotProduct = (a: number[], b: number[]): number => {
      let sum = 0
      for (let i = 0; i < 768; i++) sum += a[i] * b[i]
      return sum
    }

    const norm = (v: number[]): number => {
      let sum = 0
      for (let i = 0; i < 768; i++) sum += v[i] * v[i]
      return Math.sqrt(sum)
    }

    const cosineSimilarity = (a: number[], b: number[]): number => {
      const na = norm(a)
      const nb = norm(b)
      if (na === 0 || nb === 0) return 0
      return dotProduct(a, b) / (na * nb)
    }

    // Union-Find 인라인 구조
    const parent: Record<string, string> = {}
    const find = (id: string): string => {
      if (!parent[id]) parent[id] = id
      if (parent[id] === id) return id
      parent[id] = find(parent[id]) // 경로 압축
      return parent[id]
    }
    const union = (id1: string, id2: string) => {
      const root1 = find(id1)
      const root2 = find(id2)
      if (root1 !== root2) {
        parent[root1] = root2
      }
    }

    const MERGE_THRESHOLD = 0.92 // TSB 기준 의미론적 임계점 (코사인 유사도 >= 0.92)
    const momentsWithVector = moments.filter(m => embeddingMap.has(m.id))
    const momentsWithoutVector = moments.filter(m => !embeddingMap.has(m.id))

    // [PERF GUARD] O(n²) 쌍별 비교는 500노드 이하에서만 수행
    // scope=all에서 2000노드 × 768d = 400만 회 연산 → 서버 타임아웃 방지
    const len = momentsWithVector.length
    if (len <= MAX_CLUSTER_NODES) {
      for (let i = 0; i < len; i++) {
        const m1 = momentsWithVector[i]
        const v1 = embeddingMap.get(m1.id)!
        for (let j = i + 1; j < len; j++) {
          const m2 = momentsWithVector[j]
          const v2 = embeddingMap.get(m2.id)!
          const sim = cosineSimilarity(v1, v2)
          if (sim >= MERGE_THRESHOLD) {
            union(m1.id, m2.id)
          }
        }
      }
    } else {
      console.log(`[ThoughtGraph] 클러스터링 스킵: ${len}노드 > ${MAX_CLUSTER_NODES} 상한 (summary 폴백 사용)`)
    }

    const groups: Map<string, typeof moments> = new Map()

    // 1. 임베딩 벡터 기반 병합 노드 적재
    momentsWithVector.forEach(m => {
      const rootId = find(m.id)
      if (!groups.has(rootId)) {
        groups.set(rootId, [])
      }
      groups.get(rootId)!.push(m)
    })

    // 2. 임베딩 없는 노드 적재 (기존 summary 문자열 폴백 호환)
    const fallbackGroups: Map<string, typeof moments> = new Map()
    momentsWithoutVector.forEach(m => {
      if (!m.summary) {
        groups.set(m.id, [m]) // 서머리마저 없으면 개별 분리
      } else {
        const key = m.summary
        if (!fallbackGroups.has(key)) {
          fallbackGroups.set(key, [])
        }
        fallbackGroups.get(key)!.push(m)
      }
    })

    // 폴백 그룹을 메인 그룹으로 병합
    for (const [key, group] of fallbackGroups.entries()) {
      groups.set(`fallback_${key}`, group)
    }

    const nodes: ThoughtNodeData[] = []
    const momentIdToRepId: Map<string, string> = new Map()

    for (const [_, groupMoments] of groups.entries()) {
      // 시간순(오름차순) 정렬하여 가장 처음 남긴 생각을 대표 앵커 노드로 선정
      groupMoments.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      const rep = groupMoments[0]
      
      // 그룹 내 모든 모먼트 ID를 대표 앵커 ID로 맵핑 정보 등록
      groupMoments.forEach(m => {
        momentIdToRepId.set(m.id, rep.id)
      })

      // 1:N posts 수납 배열 빌드 (다수 유저의 피드가 하나의 슈퍼노드에 수납됨)
      const posts = groupMoments.map(m => {
        const trans = (m as any).translations?.[0]?.content
        const finalContent = trans || m.content || ''
        return {
          id: m.id,
          userId: m.user_id,
          content: finalContent,
          displayName: m.user.display_name,
          avatarUrl: m.user.avatar_image_url,
          createdAt: m.created_at.toISOString(),
        }
      })

      const repTrans = (rep as any).translations?.[0]?.content
      const repContent = repTrans || rep.content
      const repSummary = repTrans
        ? (repTrans.length > 12 ? repTrans.substring(0, 12) + '...' : repTrans)
        : rep.summary

      nodes.push({
        id: rep.id,
        userId: rep.user_id,
        content: repContent,
        summary: repSummary,
        category: rep.category,
        galaxyKey: rep.galaxy_key,
        moodId: rep.mood_id,
        createdAt: rep.created_at.toISOString(),
        displayName: rep.user.display_name,
        avatarUrl: rep.user.avatar_image_url,
        posts, // 1:N 묶음 피드 리스트 주입!
      })
    }

    // 엣지(연결선) 리매핑: 슈퍼엣지 병합 + weight 합산
    const uniqueEdges: Map<string, ThoughtEdge> = new Map()

    for (const r of relationships) {
      const repSource = momentIdToRepId.get(r.source_moment_id)
      const repTarget = momentIdToRepId.get(r.target_moment_id)

      // 소스와 타겟이 모두 존재하며, 동일 노드로 수렴하는 루프 엣지가 아닌 경우만 선으로 연결
      if (repSource && repTarget && repSource !== repTarget) {
        const edgeKey = `${repSource}_${repTarget}_${r.relation_type}`
        if (!uniqueEdges.has(edgeKey)) {
          uniqueEdges.set(edgeKey, {
            id: r.id,
            source: repSource,
            target: repTarget,
            relationType: r.relation_type,
            weight: r.weight,
            createdBy: r.created_by as 'ai' | 'user' | 'ai-backfill',
            status: r.status,
          })
        } else {
          // 동일 슈퍼엣지에 합산: 다수 원본 엣지의 weight를 누적하여 연결 강도 보존
          const existing = uniqueEdges.get(edgeKey)!
          existing.weight = Math.min(1.0, existing.weight + r.weight * 0.1)
        }
      }
    }

    const edges = Array.from(uniqueEdges.values())

    // ── Phase 5: MAX_NODES cap — 수렴 후 노드 상한 적용 ──
    // 노드가 MAX_NODES를 초과하면 엣지 연결 수(hub 우선)로 정렬하여 최소 연결 노드부터 제거
    let finalNodes = nodes
    let finalEdges = edges

    if (nodes.length > MAX_NODES) {
      // 각 노드의 엣지 연결 수 계산
      const nodeEdgeCount = new Map<string, number>()
      nodes.forEach(n => nodeEdgeCount.set(n.id, 0))
      edges.forEach(e => {
        nodeEdgeCount.set(e.source, (nodeEdgeCount.get(e.source) || 0) + 1)
        nodeEdgeCount.set(e.target, (nodeEdgeCount.get(e.target) || 0) + 1)
      })

      // 연결 수 내림차순 정렬 → 상위 MAX_NODES만 유지
      finalNodes = [...nodes]
        .sort((a, b) => (nodeEdgeCount.get(b.id) || 0) - (nodeEdgeCount.get(a.id) || 0))
        .slice(0, MAX_NODES)

      const retainedIds = new Set(finalNodes.map(n => n.id))
      finalEdges = edges.filter(e => retainedIds.has(e.source) && retainedIds.has(e.target))
    }

    // ── Phase 6: 집계 메타데이터 빌드 (프론트엔드 줌아웃 슈퍼노드용) ──
    const categoryCounts: Record<string, number> = {}
    moments.forEach(m => {
      const cat = m.category || 'UNCATEGORIZED'
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    })

    // 엣지 연결이 없는 외딴 고립 노드(Isolated Nodes)도 nodes 풀에 온전히 보존되어 프론트엔드로 전달됩니다.
    const response: ThoughtGraphResponse = {
      nodes: finalNodes,
      edges: finalEdges,
      totalCount: moments.length,
      categoryCounts,
    }
    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[ThoughtGraph] GET 오류:', error?.message || error)
    if (error?.stack) console.error('[ThoughtGraph] Stack:', error.stack)
    return NextResponse.json({ error: 'Internal Server Error', detail: error?.message }, { status: 500 })
  }
}
