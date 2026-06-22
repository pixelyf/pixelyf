/**
 * [Reflection 배치 API Route]
 * 3단계 기억 정제 배치: Light(24h) → REM(3일) → Deep(2주)
 *
 * 트리거:
 * - 개발: curl -X POST .../api/ai/reflection -H "Authorization: Bearer {secret}" -d '{"phase":"LIGHT"}'
 * - 프로덕션: 서버 cron
 *   - Light: 매일 00:00
 *   - REM: 3일마다
 *   - Deep: 2주마다
 *
 * 각 단계:
 *   LIGHT: AI 활동 + 주인 Moments → Raw 기억 수집 → Compressed 압축
 *   REM:   Compressed 3건 → 기간 요약 1건으로 재압축
 *   DEEP:  승격 조건 충족 기억 → Long-term 승격 + SOUL 갱신
 */

import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { classifyCategoryWithLLM } from '@/shared/lib/ai/compaction'
import { loadMemoryPromotionEvidence } from '@/shared/lib/ai/memoryRecallTracker'
import {
  buildActiveMemoryWhere,
  chooseSupersedeCandidate,
  inferPromotedMemorySemantics,
} from '@/shared/lib/ai/memorySemantics'
import { getReflectionMemoryStreams, getReflectionMetadata } from '@/shared/lib/ai/memoryPolicy'
import { buildMemoryWritePlan, buildPromotionUpdate } from '@/shared/lib/ai/memoryWriteGate'
import { recordMemoryEvalSnapshot } from '@/shared/lib/ai/memoryEval'
import { recordMemoryTrace } from '@/shared/lib/ai/memoryTrace'
import { suggestThreadsFromMemory, shouldAutoCreate } from '@/shared/lib/ai/reflectionBridge'
import { evolvePersonality } from '@/shared/lib/ai/personalityEvolution'
import { compactReflectionLayer } from '@/shared/lib/ai/reflectionMemory'

// ─── 상수 ────────────────────────────────────────────────────

type ReflectionPhase = 'LIGHT' | 'REM' | 'DEEP'

const VALID_PHASES: ReflectionPhase[] = ['LIGHT', 'REM', 'DEEP']

// [15번 설계서] 소셜 커뮤니티 재구축 글로벌 중복 방지 가드 플래그
let isSocialCommunityRebuilt = false

/** Light: 최근 24시간 */
const LIGHT_HOURS = parseInt(process.env.AI_LIGHT_SLEEP_HOURS || '24', 10)
/** REM: 최근 3일 Compressed 수집 */
const REM_DAYS = parseInt(process.env.AI_REM_SLEEP_DAYS || '3', 10)
/** Deep: 승격 조건 */
const DEEP_MIN_RECALL = 3
const DEEP_MIN_CONTEXTS = 2
const DEEP_EVIDENCE_DAYS = parseInt(process.env.AI_DEEP_EVIDENCE_DAYS || '30', 10)
const REFLECTION_STREAMS = getReflectionMemoryStreams()

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ─── API Route ───────────────────────────────────────────────

export async function POST(req: Request) {
  // ── 0. 글로벌 가드 플래그 초기화 ──
  isSocialCommunityRebuilt = false

  // ── 인증 ──
  const secret = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!secret || secret !== process.env.AI_HEARTBEAT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── phase 파라미터 ──
  const body = await req.json().catch(() => null)
  const phase = body?.phase as ReflectionPhase | undefined

  if (!phase || !VALID_PHASES.includes(phase)) {
    return NextResponse.json(
      { error: `Invalid phase. Must be one of: ${VALID_PHASES.join(', ')}` },
      { status: 400 },
    )
  }

  // ── 활성 AI 수집 ──
  const activeSouls = await prisma.aiSoul.findMany({
    where: { isActive: true },
    select: { id: true, userId: true },
  })

  if (activeSouls.length === 0) {
    return NextResponse.json({ success: true, message: '활성 AI 없음', processed: 0 })
  }

  // ── 각 AI별 처리 (에러 격리) ──
  const results: { soulId: string; inputCount: number; promotedCount: number; error?: string }[] = []

  for (const soul of activeSouls) {
    const startMs = Date.now()
    try {
      let result: { inputCount: number; promotedCount: number }

      switch (phase) {
        case 'LIGHT':
          result = await processLight(soul.id, soul.userId)
          break
        case 'REM':
          result = await processREM(soul.id)
          break
        case 'DEEP':
          result = await processDEEP(soul.id)
          break
      }

      // Reflection 로그 기록
      await prisma.aiReflectionLog.create({
        data: {
          aiSoulId: soul.id,
          phase,
          inputCount: result.inputCount,
          promotedCount: result.promotedCount,
          durationMs: Date.now() - startMs,
        },
      })

      results.push({ soulId: soul.id, ...result })
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`[Reflection:${phase}] soulId=${soul.id} 실패:`, errorMessage)
      results.push({ soulId: soul.id, inputCount: 0, promotedCount: 0, error: errorMessage })
    }
  }

  return NextResponse.json({ success: true, phase, processed: activeSouls.length, results })
}

// ─── LIGHT: Raw 기억 수집 + Compressed 압축 ─────────────────

async function processLight(
  soulId: string,
  userId: string,
): Promise<{ inputCount: number; promotedCount: number }> {
  const since = new Date(Date.now() - LIGHT_HOURS * 60 * 60 * 1000)

  // 1. AI 자신의 최근 활동 수집 (AiMoment → Raw SELF)
  const recentMoments = await prisma.aiMoment.findMany({
    where: { soulId, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, content: true, actionType: true, targetSoulId: true, createdAt: true },
  })

  // 2. 주인의 최근 Moments 수집 (Raw OWNER)
  // moments 테이블에서 주인의 최근 글 가져오기
  const ownerMoments = await prisma.moment.findMany({
    where: {
      user_id: userId,
      created_at: { gte: since },
      is_deleted: false,
      is_filtered: false,
      is_subscriber_only: false,
    },
    orderBy: { created_at: 'asc' },
    take: 10,
    select: { id: true, content: true, created_at: true },
  })

  // 3. Raw 기억으로 저장 (이미 존재하지 않는 것만)
  let inputCount = 0

  for (const m of recentMoments) {
    const exists = await prisma.aiMemory.findFirst({
      where: { aiSoulId: soulId, source: `MOMENT:${m.id}` },
      select: { id: true },
    })
    if (!exists) {
      const selfMetadata = getReflectionMetadata('SELF')
      const plan = buildMemoryWritePlan({
        aiSoulId: soulId,
        memoryStream: 'SELF',
        memoryLayer: 'RAW',
        theme: `[${m.actionType}] ${m.content.slice(0, 200)}`,
        source: `MOMENT:${m.id}`,
        metadata: selfMetadata,
        policySource: 'HEARTBEAT',
        provenance: {
          originType: 'HEARTBEAT',
          originId: m.id,
        },
      })
      if (!plan.data) {
        await recordMemoryTrace({
          soulId,
          stage: 'write_gate',
          traceKey: 'REFLECTION_LIGHT_SELF',
          status: 'blocked',
          payload: { action: plan.action, source: `MOMENT:${m.id}` },
        })
        continue
      }
      await prisma.aiMemory.create({
        data: plan.data,
      })
      await recordMemoryTrace({
        soulId,
        stage: 'write_gate',
        traceKey: 'REFLECTION_LIGHT_SELF',
        status: 'success',
        payload: { action: plan.action, source: `MOMENT:${m.id}` },
      })
      inputCount++
    }
  }

  for (const m of ownerMoments) {
    const exists = await prisma.aiMemory.findFirst({
      where: { aiSoulId: soulId, source: `OWNER_MOMENT:${m.id}` },
      select: { id: true },
    })
    if (!exists) {
      const ownerMetadata = getReflectionMetadata('OWNER')
      const plan = buildMemoryWritePlan({
        aiSoulId: soulId,
        memoryStream: 'OWNER',
        memoryLayer: 'RAW',
        theme: (m.content || '').slice(0, 300),
        source: `OWNER_MOMENT:${m.id}`,
        metadata: ownerMetadata,
        policySource: 'MOMENT',
        provenance: {
          originType: 'MOMENT',
          originId: m.id,
        },
      })
      if (!plan.data) {
        await recordMemoryTrace({
          soulId,
          stage: 'write_gate',
          traceKey: 'REFLECTION_LIGHT_OWNER',
          status: 'blocked',
          payload: { action: plan.action, source: `OWNER_MOMENT:${m.id}` },
        })
        continue
      }
      await prisma.aiMemory.create({
        data: plan.data,
      })
      await recordMemoryTrace({
        soulId,
        stage: 'write_gate',
        traceKey: 'REFLECTION_LIGHT_OWNER',
        status: 'success',
        payload: { action: plan.action, source: `OWNER_MOMENT:${m.id}` },
      })
      inputCount++
    }
  }

  // 4. Raw → Compressed 압축 (compaction 엔진)
  if (inputCount > 0) {
    for (const stream of REFLECTION_STREAMS) {
      await compactReflectionLayer({
        soulId,
        stream,
        memoryLayer: 'RAW',
      })
    }
  }

  // 5. 오래된 RAW 기억 비활성화 (TTL: 7일, provenance 보존)
  if (inputCount > 0) {
    await cleanupRawMemories(soulId)
  }

  return { inputCount, promotedCount: 0 }
}

// ─── REM: Compressed → 기간 요약 재압축 ─────────────────────

async function processREM(
  soulId: string,
): Promise<{ inputCount: number; promotedCount: number }> {
  const since = new Date(Date.now() - REM_DAYS * 24 * 60 * 60 * 1000)

  // 최근 REM_DAYS 동안의 COMPRESSED 기억 수집
  const compressed = await prisma.aiMemory.findMany({
    where: {
      aiSoulId: soulId,
      memoryLayer: 'COMPRESSED',
      memoryStream: { in: [...REFLECTION_STREAMS] },
      isPromoted: false,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, theme: true, memoryStream: true },
  })

  if (compressed.length < 2) {
    return { inputCount: compressed.length, promotedCount: 0 }
  }

  // SELF 스트림과 OWNER 스트림 각각 재압축
  for (const stream of REFLECTION_STREAMS) {
    await compactReflectionLayer({
      soulId,
      stream,
      memoryLayer: 'COMPRESSED',
      since,
    })
  }

  return { inputCount: compressed.length, promotedCount: 0 }
}

// ─── DEEP: 승격 조건 → Long-term 승격 ───────────────────────

async function processDEEP(
  soulId: string,
): Promise<{ inputCount: number; promotedCount: number }> {
  const evidenceSince = new Date(Date.now() - DEEP_EVIDENCE_DAYS * 24 * 60 * 60 * 1000)
  const evidenceMap = await loadMemoryPromotionEvidence(soulId, evidenceSince)

  if (evidenceMap.size === 0) {
    await recordMemoryTrace({
      soulId,
      stage: 'promote',
      traceKey: 'DEEP',
      status: 'blocked',
      payload: {
        reason: 'no_evidence',
        evidenceWindowDays: DEEP_EVIDENCE_DAYS,
      },
    })
    await recordMemoryEvalSnapshot({
      soulId,
      releaseTag: process.env.MEMORY_POLICY_RELEASE_TAG ?? 'dev',
    }).catch((error) => {
      console.error('[MemoryEval] reflection snapshot 기록 실패:', error)
    })
    return { inputCount: 0, promotedCount: 0 }
  }

  const memories = await prisma.aiMemory.findMany({
    where: {
      aiSoulId: soulId,
      memoryLayer: 'COMPRESSED',
      memoryStream: { in: [...REFLECTION_STREAMS] },
      isPromoted: false,
      id: { in: [...evidenceMap.keys()] },
    },
    orderBy: { importanceScore: 'desc' },
    select: {
      id: true,
      theme: true,
      memoryStream: true,
      recallCount: true,
      uniquePartners: true,
      importanceScore: true,
    },
  })

  const candidates = memories
    .map((memory) => ({
      ...memory,
      evidence: evidenceMap.get(memory.id),
    }))
    .filter((memory) => {
      if (!memory.evidence) {
        return false
      }

      if (memory.evidence.recallCount < DEEP_MIN_RECALL) {
        return false
      }

      if (memory.memoryStream === 'SELF') {
        return memory.evidence.uniqueContexts >= 1
      }

      return memory.evidence.uniqueContexts >= DEEP_MIN_CONTEXTS
    })
    .slice(0, 5)

  if (candidates.length === 0) {
    await recordMemoryTrace({
      soulId,
      stage: 'promote',
      traceKey: 'DEEP',
      status: 'blocked',
      payload: {
        reason: 'no_candidates',
        evidenceWindowDays: DEEP_EVIDENCE_DAYS,
        compressedCount: memories.length,
      },
    })
    await recordMemoryEvalSnapshot({
      soulId,
      releaseTag: process.env.MEMORY_POLICY_RELEASE_TAG ?? 'dev',
    }).catch((error) => {
      console.error('[MemoryEval] reflection snapshot 기록 실패:', error)
    })
    return { inputCount: 0, promotedCount: 0 }
  }

  // 카테고리 분류 (LLM 기반 분류)
  let promotedCount = 0
  for (const c of candidates) {
    const category = await classifyCategoryWithLLM(soulId, c.theme)
    const promotedAt = new Date()
    const semanticSnapshot = inferPromotedMemorySemantics({
      theme: c.theme,
      promotedCategory: category,
      importanceScore: c.importanceScore,
      recallCount: c.evidence?.recallCount ?? c.recallCount,
    })

    await prisma.$transaction(async (tx) => {
      if (c.evidence) {
        await tx.aiMemory.update({
          where: { id: c.id },
          data: {
            recallCount: c.evidence.recallCount,
            uniquePartners: c.evidence.uniquePartners,
          },
        })
      }

      let supersedeTargetId: string | null = null
      if (semanticSnapshot.factType === 'FACT') {
        const olderActiveFacts = await tx.aiMemory.findMany({
          where: {
            aiSoulId: soulId,
            memoryStream: c.memoryStream,
            memoryLayer: 'LONG_TERM',
            isPromoted: true,
            promotedCategory: category,
            id: { not: c.id },
            isLocked: false,
            AND: [
              buildActiveMemoryWhere(promotedAt),
              {
                OR: [
                  { factType: 'FACT' },
                  { factType: null },
                ],
              },
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, theme: true, createdAt: true },
        })
        const supersedeTarget = chooseSupersedeCandidate(c.theme, olderActiveFacts)
        supersedeTargetId = supersedeTarget?.id ?? null

        if (supersedeTargetId) {
          await tx.aiMemory.update({
            where: { id: supersedeTargetId },
            data: {
              validTo: promotedAt,
              supersededById: c.id,
            },
          })
        }
      }

      await tx.aiMemory.update({
        where: { id: c.id },
        data: buildPromotionUpdate(category, promotedAt, {
          factType: semanticSnapshot.factType,
          confidence: semanticSnapshot.confidence,
          validFrom: promotedAt,
          supersedesId: supersedeTargetId,
        }),
      })
    })
    promotedCount++
  }

  await recordMemoryTrace({
    soulId,
    stage: 'promote',
    traceKey: 'DEEP',
    status: 'success',
    payload: {
      candidateCount: candidates.length,
      promotedCount,
      evidenceWindowDays: DEEP_EVIDENCE_DAYS,
    },
  })

  // memoryVersion 증가
  if (promotedCount > 0) {
    await prisma.aiSoul.update({
      where: { id: soulId },
      data: {
        memoryVersion: { increment: 1 },
        lastReflectionAt: new Date(),
      },
    })

    // v3: 승격 기억 기반 Thread 자동 생성
    try {
      const suggestions = await suggestThreadsFromMemory(soulId)
      for (const s of suggestions) {
        if (shouldAutoCreate(s)) {
          await prisma.aiLifeThread.create({
            data: {
              soulId,
              type: 'PROJECT',
              title: s.title,
              category: s.category,
              desire: s.desire,
            },
          })
          console.log(`[ReflectionBridge] Thread 자동 생성: "${s.title}" (confidence=${s.confidence.toFixed(2)})`)
        }
      }
    } catch (error: unknown) {
      console.error('[ReflectionBridge] Thread 자동 생성 실패:', getErrorMessage(error))
    }

    // v4: 성격 미세 진화
    try {
      const evolution = await evolvePersonality(soulId)
      if (evolution.applied) {
        console.log(`[PersonalityEvolution] 성격 변화 적용:`, evolution.deltas.map(d => `${d.axis} ${d.delta > 0 ? '+' : ''}${d.delta}`).join(', '))
      }
    } catch (error: unknown) {
      console.error('[PersonalityEvolution] 성격 진화 실패:', getErrorMessage(error))
    }

    // v5: [Neural RAG] 기억 군집 재빌드 (Graphology & Louvain 연계)
    try {
      const { rebuildMemoryCommunities } = await import('@/shared/lib/ai/memoryGraphEngine')
      const graphResult = await rebuildMemoryCommunities(soulId)
      console.log(`[MemoryGraph] soulId=${soulId}: ${graphResult.communities} communities, ${graphResult.summariesGenerated} summaries generated.`)
    } catch (error: unknown) {
      console.error('[MemoryGraph] 기억 군집 빌드 실패:', getErrorMessage(error))
    }

    // v6: [15번 설계서] 글로벌 소셜 커뮤니티 재구축 (전체 Soul 대상, 1회 가드 적용)
    if (!isSocialCommunityRebuilt) {
      try {
        const { rebuildSocialCommunities } = await import('@/shared/lib/ai/socialCommunityEngine')
        const socialResult = await rebuildSocialCommunities()
        console.log(`[DEEP] Social Community 재구축: ${socialResult.communities}개 커뮤니티, ${socialResult.bondsUpdated}개 Bond 갱신 완료.`)
        isSocialCommunityRebuilt = true
      } catch (error: unknown) {
        console.error('[DEEP] Social Community 재구축 실패:', getErrorMessage(error))
      }
    }
  }

  await recordMemoryEvalSnapshot({
    soulId,
    releaseTag: process.env.MEMORY_POLICY_RELEASE_TAG ?? 'dev',
  }).catch((error) => {
    console.error('[MemoryEval] reflection snapshot 기록 실패:', error)
  })

  return { inputCount: candidates.length, promotedCount }
}

// ─── TTL (데이터 팽창 제어) ───────────────────────────────────

/**
 * 7일 경과된 RAW 기억을 검색/재압축 대상에서 제외하되 계보는 보존합니다.
 */
async function cleanupRawMemories(soulId: string): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const invalidatedAt = new Date()
  await prisma.aiMemory.updateMany({
    where: {
      aiSoulId: soulId,
      memoryLayer: 'RAW',
      createdAt: { lt: sevenDaysAgo },
      invalidatedAt: null,
      // Direct Chat RAW는 별도 기억 보존 정책을 따른다.
      NOT: { source: { startsWith: 'DIRECT_CHAT' } },
    },
    data: {
      invalidatedAt,
      invalidationReason: 'RAW_TTL_ARCHIVED',
      validTo: invalidatedAt,
    },
  })
}

// ─── 카테고리 분류 ─────────────────────────────
// 이제 compaction.ts의 classifyCategoryWithLLM을 사용합니다.
