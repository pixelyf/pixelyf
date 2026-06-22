/**
 * [생각그래프] 2-hop 백필 배치 엔진
 * 
 * 기존 confirmed 엣지를 SQL JOIN으로 순회하여 아직 직접 연결되지 않은
 * 2-hop 브릿지 후보를 추출하고, LLM 배치 추론으로 누락된 논리 관계를 사후 발견합니다.
 * 
 * [3패턴 통합 탐색]
 * 1. 순방향 체인 (A→B→C)  — 전이적 논리 관계
 * 2. 공동 타겟   (A→B←C)  — 동일 주제 수렴
 * 3. 공동 소스   (B→A, B→C) — 동일 허브 발산
 * 
 * [안전장치]
 * - 배치당 최대 50쌍 추출, 10개씩 LLM 번들링 → 최대 5 API 호출
 * - rejected 관계 재추론 방지 (NOT EXISTS에서 status 조건 없음)
 * - 백필 관계는 모두 'pending' 상태로 저장 (사용자 검증 우선)
 * - created_by: 'ai-backfill'로 1-hop AI와 구분
 */

import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import { resolveApiKeyByUserId } from '@/shared/lib/ai/compaction'
import { callLLM } from '@/shared/lib/ai/llm'
import { COMPACTION_MODELS } from '@/shared/lib/ai/modelSelector'
import { CONFIDENCE_THRESHOLDS } from '@/shared/lib/thought-graph/types'
import type { BackfillCandidate } from '@/shared/lib/thought-graph/types'
import crypto from 'crypto'

/** 배치당 최대 브릿지 후보 수 */
const MAX_CANDIDATES_PER_BATCH = 50

/** LLM 호출당 번들링 크기 */
const BUNDLE_SIZE = 10

/**
 * 2-hop 브릿지 후보 추출 SQL (3패턴 UNION ALL)
 * 
 * 팩트체크 BUG #1 수정: 순방향 체인만이 아닌 공동타겟, 공동소스 패턴 포함
 * 팩트체크 BUG #2 수정: NOT EXISTS에서 rejected 포함 모든 관계 체크 (재추론 방지)
 */
const BRIDGE_QUERY = `
WITH bridge_candidates AS (
  -- 패턴 1: 순방향 체인 (A→B→C)
  SELECT
    r1.source_moment_id AS node_a,
    r1.target_moment_id AS bridge,
    r2.target_moment_id AS node_c,
    r1.weight AS w1, r2.weight AS w2
  FROM moment_relationships r1
  INNER JOIN moment_relationships r2
    ON r1.target_moment_id = r2.source_moment_id
  WHERE r1.status = 'confirmed' AND r2.status = 'confirmed'
    AND r1.source_moment_id != r2.target_moment_id

  UNION ALL

  -- 패턴 2: 공동 타겟 (A→B←C) — 같은 생각을 확장한 서로 다른 글
  SELECT
    r1.source_moment_id AS node_a,
    r1.target_moment_id AS bridge,
    r2.source_moment_id AS node_c,
    r1.weight AS w1, r2.weight AS w2
  FROM moment_relationships r1
  INNER JOIN moment_relationships r2
    ON r1.target_moment_id = r2.target_moment_id
  WHERE r1.status = 'confirmed' AND r2.status = 'confirmed'
    AND r1.source_moment_id < r2.source_moment_id

  UNION ALL

  -- 패턴 3: 공동 소스 (B→A, B→C) — 같은 허브에서 파생된 글
  SELECT
    r1.target_moment_id AS node_a,
    r1.source_moment_id AS bridge,
    r2.target_moment_id AS node_c,
    r1.weight AS w1, r2.weight AS w2
  FROM moment_relationships r1
  INNER JOIN moment_relationships r2
    ON r1.source_moment_id = r2.source_moment_id
  WHERE r1.status = 'confirmed' AND r2.status = 'confirmed'
    AND r1.target_moment_id < r2.target_moment_id
)
SELECT DISTINCT ON (node_a, node_c)
  bc.node_a, bc.bridge, bc.node_c,
  bc.w1, bc.w2
FROM bridge_candidates bc
-- [BUG #2 수정] rejected 포함 모든 관계 존재 시 스킵 → 재추론 방지
WHERE NOT EXISTS (
  SELECT 1 FROM moment_relationships rx
  WHERE (rx.source_moment_id = bc.node_a AND rx.target_moment_id = bc.node_c)
     OR (rx.source_moment_id = bc.node_c AND rx.target_moment_id = bc.node_a)
)
-- 같은 은하 + 미삭제 노드만
AND EXISTS (
  SELECT 1 FROM moments m1
  INNER JOIN moments m2 ON m1.galaxy_key = m2.galaxy_key
  WHERE m1.id = bc.node_a AND m2.id = bc.node_c
    AND m1.is_deleted = false AND m2.is_deleted = false
)
ORDER BY node_a, node_c, (bc.w1 * bc.w2) DESC
LIMIT $1;
`

/**
 * 백필 배치 실행 메인 함수
 * 
 * @param userId - 호출한 관리자의 user_id (API 키 조회용)
 * @returns 발견 및 저장된 신규 관계 수
 */
export async function backfillThoughtGraph(userId: string): Promise<{
  candidatesFound: number
  relationshipsCreated: number
  llmCallsMade: number
}> {
  const stats = { candidatesFound: 0, relationshipsCreated: 0, llmCallsMade: 0 }

  try {
    // 1. 2-hop 브릿지 후보 추출
    const candidates: BackfillCandidate[] = await prisma.$queryRawUnsafe(
      BRIDGE_QUERY,
      MAX_CANDIDATES_PER_BATCH
    )

    stats.candidatesFound = candidates.length

    if (candidates.length === 0) {
      console.log('[Backfill] 브릿지 후보 없음 — 모든 2-hop 경로가 이미 직접 연결됨')
      return stats
    }

    console.log(`[Backfill] ${candidates.length}개 브릿지 후보 발견`)

    // 2. 관련 모먼트 컨텍스트 일괄 로드
    const allMomentIds = new Set<string>()
    candidates.forEach(c => {
      allMomentIds.add(c.node_a)
      allMomentIds.add(c.bridge)
      allMomentIds.add(c.node_c)
    })

    const moments = await prisma.moment.findMany({
      where: {
        id: { in: Array.from(allMomentIds) },
        is_deleted: false,
      },
      select: {
        id: true,
        content: true,
        summary: true,
        user_id: true,
        galaxy_key: true,
      },
    })

    const momentMap = new Map(moments.map(m => [m.id, m]))

    // 3. API 키 조회 (호출자의 키 사용)
    const { apiKey, provider } = await resolveApiKeyByUserId(userId)

    // 4. LLM 배치 추론 (BUNDLE_SIZE 개씩 번들링)
    const allRelationships: Array<{
      source_id: string
      target_id: string
      relation_type: string
      confidence: number
      galaxy_key: string
    }> = []

    for (let i = 0; i < candidates.length; i += BUNDLE_SIZE) {
      const bundle = candidates.slice(i, i + BUNDLE_SIZE)

      // 유효한 후보만 필터 (모먼트 데이터가 존재하는 것)
      const validBundle = bundle.filter(c =>
        momentMap.has(c.node_a) && momentMap.has(c.bridge) && momentMap.has(c.node_c)
      )

      if (validBundle.length === 0) continue

      const bundlePrompt = validBundle.map((c, idx) => {
        const momentA = momentMap.get(c.node_a)!
        const momentB = momentMap.get(c.bridge)!
        const momentC = momentMap.get(c.node_c)!
        return `후보 #${idx + 1}:
  생각 A (ID: "${c.node_a}"): "${momentA.content?.slice(0, 200) || '(내용 없음)'}"
  ↕ [브릿지 경유]
  생각 B (ID: "${c.bridge}"): "${momentB.content?.slice(0, 200) || '(내용 없음)'}"
  ↕ [브릿지 경유]
  생각 C (ID: "${c.node_c}"): "${momentC.content?.slice(0, 200) || '(내용 없음)'}"
  
  → A↔C 직접 관계가 성립하는가?`
      }).join('\n\n')

      const systemPrompt = `당신은 지식 그래프 다단계 관계 추론 엔진입니다.
기존에 발견된 1-hop 관계를 기반으로, 아직 직접 연결되지 않은 두 생각(A↔C) 사이의 잠재적 논리 관계를 추론합니다.
중간 브릿지 노드(B)를 경유한 논리적 연결이 직접 관계로도 성립하는지 판단하세요.

관계 유형:
- "extends": A가 C를 확장하거나 심화함
- "supports": A가 C를 뒷받침함
- "contradicts": A와 C가 대립/모순됨
- "refines": A가 C를 보완/정제함
- "instantiates": A가 C의 구체적 사례
- "requires": A를 이해하려면 C가 전제 필요
- "triggered-by": C가 원인이 되어 A가 유발됨

관계가 성립하지 않는 후보는 결과에서 제외하세요.
반드시 아래 JSON 스키마로만 응답하세요:
{
  "backfill_relationships": [
    {
      "source_id": "A의 ID",
      "target_id": "C의 ID",
      "relation_type": "extends|supports|contradicts|refines|instantiates|requires|triggered-by",
      "confidence": 0.0~1.0
    }
  ]
}`

      const userPrompt = `[분석 대상 브릿지 후보 ${validBundle.length}쌍]\n\n${bundlePrompt}`

      const relationModel = COMPACTION_MODELS[provider]
      const result = await callLLM({
        apiKey,
        provider,
        model: relationModel,
        systemPrompt,
        userPrompt,
        responseFormat: 'json',
        temperature: 0.1,
        maxOutputTokens: 1500,
      })

      stats.llmCallsMade++

      // JSON 파싱 (LLM 출력 오류 대비)
      try {
        const parsed = JSON.parse(result.content)
        const rels = parsed.backfill_relationships || []

        for (const rel of rels) {
          // 유효성 검증: ID가 실제 후보에 포함되는지
          const matchedCandidate = validBundle.find(
            c => (c.node_a === rel.source_id && c.node_c === rel.target_id) ||
                 (c.node_a === rel.target_id && c.node_c === rel.source_id)
          )

          if (matchedCandidate && rel.confidence >= CONFIDENCE_THRESHOLDS.TOAST_MIN) {
            const momentA = momentMap.get(rel.source_id)
            allRelationships.push({
              source_id: rel.source_id,
              target_id: rel.target_id,
              relation_type: rel.relation_type,
              confidence: rel.confidence,
              galaxy_key: momentA?.galaxy_key || '',
            })
          }
        }
      } catch {
        console.warn(`[Backfill] LLM JSON 파싱 실패 (번들 ${Math.floor(i / BUNDLE_SIZE) + 1} 스킵)`)
      }
    }

    if (allRelationships.length === 0) {
      console.log('[Backfill] LLM 추론 결과 유효한 신규 관계 없음')
      return stats
    }

    // 5. DB 저장 — 모두 pending 상태, created_by: 'ai-backfill'
    const toSave = allRelationships.map(r => ({
      id: crypto.randomUUID(),
      source_moment_id: r.source_id,
      target_moment_id: r.target_id,
      relation_type: r.relation_type,
      weight: r.confidence,
      status: 'pending',
      created_by: 'ai-backfill',
    }))

    const result = await prisma.momentRelationship.createMany({
      data: toSave,
      skipDuplicates: true,
    })

    stats.relationshipsCreated = result.count

    // 6. Supabase Realtime 브로드캐스트 (은하별 그룹핑)
    const galaxyGroups = new Map<string, typeof toSave>()
    toSave.forEach(r => {
      const rel = allRelationships.find(
        ar => ar.source_id === r.source_moment_id && ar.target_id === r.target_moment_id
      )
      const gk = rel?.galaxy_key || 'unknown'
      if (!galaxyGroups.has(gk)) galaxyGroups.set(gk, [])
      galaxyGroups.get(gk)!.push(r)
    })

    if (result.count > 0) {
      const supabase = await createClient()
      for (const [galaxyKey, rels] of galaxyGroups.entries()) {
        if (galaxyKey === 'unknown') continue
        const channel = supabase.channel(`thought-graph:${galaxyKey}`)
        await channel.send({
          type: 'broadcast',
          event: 'backfill-relationships',
          payload: {
            count: rels.length,
            relationships: rels.map(r => ({
              id: r.id,
              source: r.source_moment_id,
              target: r.target_moment_id,
              relationType: r.relation_type,
              weight: r.weight,
              status: r.status,
              createdBy: r.created_by,
            })),
          },
        })
        await supabase.removeChannel(channel)
      }
    }

    console.log(`[Backfill] 완료: 후보=${stats.candidatesFound}, 생성=${stats.relationshipsCreated}, LLM호출=${stats.llmCallsMade}`)
    return stats
  } catch (error) {
    console.error('[Backfill] 배치 처리 오류:', error)
    throw error
  }
}
