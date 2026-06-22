/**
 * [Heartbeat 프롬프트 조립 모듈]
 * SOUL 프롬프트 + 2스트림 메모리 + 현재 상황 컨텍스트를 조립합니다.
 * 서버사이드 전용 — Heartbeat 오케스트레이터에서 callLLM() 호출 전에 사용.
 *
 * 토큰 예산 (~1,600 토큰):
 *   SOUL (고정 성격): ~300
 *   주인 기억 (Owner): ~500
 *   AI 자신 기억 (Self): ~600
 *   현재 상황 컨텍스트: ~200
 *
 * 의존:
 * - prisma: AiSoul, AiMemory, AiMoment 조회
 * - soulEngine.ts: SoulPromptData 타입 참조 (참고용)
 *
 * 스키마 참조:
 * - AiSoul.soulPrompt: 온보딩 시 generateSoulPrompt()로 생성, 저장된 값 그대로 사용
 * - AiMemory.memoryStream: 'OWNER' | 'SELF'
 * - AiMemory.memoryLayer: 'RAW' | 'COMPRESSED' | 'LONG_TERM'
 * - AiMemory.theme: 기억 본문 (LLM 요약 결과)
 * - AiMoment.actionType: 'POST' | 'COMMENT' | 'PING' | 'TOUCH'
 */

import prisma from '@/shared/lib/prisma'
import { buildActiveMemoryWhere } from './memorySemantics'
import { buildHeartbeatRetrievalScope, retrieveAiMemories } from './memoryRetrievalService'
import type { ReflectableMemoryStream } from './memoryPolicy'
import { getPersonaPatternForSoul, getRelationshipLevel, TONE_GROUP_PROPERTIES } from './writingPersona'

// ─── 타입 정의 ───────────────────────────────────────────────

/** 프롬프트 조립 결과 */
export interface AssembledPrompt {
  /** LLM systemPrompt로 전달 (SOUL + Owner Memory + Self Memory) */
  systemPrompt: string
  /** LLM userPrompt로 전달 (현재 상황 + 행동 결정 요청) */
  userPrompt: string
}

/** Whisper 데이터 (heartbeat에서 조회 후 전달) */
export interface WhisperData {
  whisperType: string
  content: string | null
  targetMomentId: string | null
  targetSoulId: string | null
  createdAt: Date
}

/** assembleHeartbeatPrompt 입력 */
export interface AssembleParams {
  /** AI Soul ID */
  soulId: string
  /** 오늘 활동 횟수 (빈도 제어용) */
  dailyActionCount: number
  /** 일일 목표 활동 수 */
  dailyTarget: number
  /** 주인의 귓속말 (최근 7일, heartbeat에서 조회) */
  whispers?: WhisperData[]
  /** Babel: 주인의 기본 언어 (ISO 639-1, heartbeat에서 전달) */
  ownerLanguage?: string
  /** 주인 닉네임 언급 허용 여부 */
  allowOwnerMention?: boolean
  ownerDisplayName?: string
  /** 10분 주기 동시 글쓰기 제어 플래그 */
  allowPostMoment?: boolean
  /** [v3] Two-Pass Architecture 모드 / [뉴런] One-Pass 모드 */
  passMode?: 'DECISION' | 'GENERATION_POST' | 'GENERATION_COMMENT' | 'NEURON_POST' | 'NEURON_COMMENT'
  /** GENERATION_COMMENT 시 대상 포스트 컨텍스트 */
  targetMomentContext?: string
  /** GENERATION_POST 시 추천 토픽 */
  topicSuggestion?: string
  /** [뉴런] 마이크로 시나리오 문장 */
  neuronScenario?: string
  /** [뉴런] 시나리오 최대 글자 수 */
  neuronMaxLength?: number
}

// ─── 쿼리 제한값 ─────────────────────────────────────────────

/** 주인 기억 Raw 최대 건수 */
const OWNER_RAW_LIMIT = 5
/** 주인 기억 Compressed 최대 건수 */
const OWNER_COMPRESSED_LIMIT = 3
/** 주인 기억 Long-term 최대 건수 */
const OWNER_LONGTERM_LIMIT = 3
/** AI 자신 기억 Raw 최대 건수 */
const SELF_RAW_LIMIT = 5
/** AI 자신 기억 Compressed 최대 건수 */
const SELF_COMPRESSED_LIMIT = 3
/** AI 자신 기억 Long-term 최대 건수 */
const SELF_LONGTERM_LIMIT = 5
/** 피드 아이템 최대 건수 */
const FEED_LIMIT = 10
/** [Phase D] IN Clause Overflow 방어 최대 배열 길이 */
const MAX_IN_CLAUSE_SIZE = 500

/**
 * [Phase D] 설계 §3 Phase 4 ① — Narrative Stage별 동적 큐 배분.
 * 탄생기/탐색기: 트렌딩 70% (탐색 극대화)
 * 각성기:       균등 배분 (33:33:34)
 * 확립기/성숙기: 이웃 60% (관계 깊이 집중)
 */
function getDynamicFeedLimits(stage: NarrativeStage): { neighbor: number; hop2: number; trending: number } {
  switch (stage) {
    case 'BIRTH':
    case 'EXPLORE':
      // 탄생기/탐색기: [이웃 10% : 2-Hop 20% : 트렌딩 70%]
      return { neighbor: 1, hop2: 2, trending: 7 }
    case 'AWAKENING':
      // 각성기: 균등 배분
      return { neighbor: 3, hop2: 3, trending: 4 }
    case 'ESTABLISH':
    case 'MATURE':
      // 확립기/성숙기: [이웃 60% : 2-Hop 30% : 트렌딩 10%]
      return { neighbor: 6, hop2: 3, trending: 1 }
  }
}
/** 내 포스트에 달린 댓글 최대 건수 */
const COMMENT_LIMIT = 5

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = parseInt(process.env[name] || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const LONG_TERM_HYBRID_POOL_LIMIT = readPositiveIntEnv('AI_PROMPT_HYBRID_POOL_LIMIT', 64)

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * Heartbeat용 프롬프트를 조립합니다.
 *
 * @example
 * ```ts
 * const { systemPrompt, userPrompt } = await assembleHeartbeatPrompt({
 *   soulId: soul.id,
 *   dailyActionCount: soul.dailyActionCount,
 *   dailyTarget: 7,
 * })
 * const result = await callLLM({ ..., systemPrompt, userPrompt, responseFormat: 'json' })
 * ```
 */
export async function assembleHeartbeatPrompt(params: AssembleParams): Promise<AssembledPrompt> {
  const { 
    soulId, 
    dailyActionCount, 
    dailyTarget, 
    whispers = [], 
    ownerLanguage = 'ko',
    allowOwnerMention = false,
    ownerDisplayName,
    allowPostMoment = true,
    passMode = 'DECISION',
    targetMomentContext = '',
    topicSuggestion = '',
    neuronScenario = '',
    neuronMaxLength = 80
  } = params

  // ── 1. 현재 상황 먼저 조회 (RAG 컨텍스트용) ──
  const [soul, recentFeed, recentComments] = await Promise.all([
    prisma.aiSoul.findUnique({
      where: { id: soulId },
      select: { soulPrompt: true, userId: true, createdAt: true,
                user: { select: { language: true } } },
    }),
    // [Phase D] 3종 동적 큐 피드 조회 (GENERATION_POST일 경우 시야 차단을 위해 피드 제외)
    passMode === 'GENERATION_POST' ? Promise.resolve([]) : fetchDynamicFeed(soulId),
    prisma.aiMoment.findMany({
      where: {
        actionType: 'COMMENT',
        parentMoment: { soulId },
      },
      orderBy: { createdAt: 'desc' },
      take: COMMENT_LIMIT,
      select: { content: true, soulId: true, createdAt: true },
    }),
  ])

  if (!soul) {
    throw new Error(`AiSoul not found: ${soulId}`)
  }

  // RAG용 컨텍스트 텍스트 추출 (피드 + 댓글)
  const contextText = [...recentFeed, ...recentComments].map(m => m.content).join('\n')

  // ── [v2] Narrative Arc Stage 산출 ──
  const narrativeStage = getNarrativeStage(soul.createdAt)

  // ── 2. [v2] Recency Decay λ 산출 ──
  const decayLambda = getDecayLambda(narrativeStage.stage)

  // ── 3. 기억 쿼리 병렬 실행 (RAG + Recency Decay 포함) ──
  const activeMemoryWhere = buildActiveMemoryWhere()
  const [
    ownerRaw,
    ownerCompressed,
    ownerLongTerm,
    selfRaw,
    selfCompressed,
    selfLongTerm,
  ] = await Promise.all([
    // 주인 기억 — Raw
    prisma.aiMemory.findMany({
      where: {
        aiSoulId: soulId,
        memoryStream: 'OWNER',
        memoryLayer: 'RAW',
        memoryNamespace: 'OWNER_FEED',
        memoryVisibility: 'PUBLIC',
        AND: [activeMemoryWhere],
      },
      orderBy: { createdAt: 'desc' },
      take: OWNER_RAW_LIMIT,
      select: { theme: true, createdAt: true },
    }),
    // 주인 기억 — Compressed
    prisma.aiMemory.findMany({
      where: {
        aiSoulId: soulId,
        memoryStream: 'OWNER',
        memoryLayer: 'COMPRESSED',
        memoryNamespace: 'OWNER_FEED',
        memoryVisibility: 'PUBLIC',
        AND: [activeMemoryWhere],
      },
      orderBy: { createdAt: 'desc' },
      take: OWNER_COMPRESSED_LIMIT,
      select: { theme: true },
    }),
    // 주인 기억 — Long-term (RAG + Recency Decay)
    searchLongTermMemoryWithRAG(soulId, 'OWNER', contextText, OWNER_LONGTERM_LIMIT, decayLambda),
    // AI 자신 기억 — Raw
    prisma.aiMemory.findMany({
      where: {
        aiSoulId: soulId,
        memoryStream: 'SELF',
        memoryLayer: 'RAW',
        memoryNamespace: 'SELF_ACTIVITY',
        memoryVisibility: 'INTERNAL',
        AND: [activeMemoryWhere],
      },
      orderBy: { createdAt: 'desc' },
      take: SELF_RAW_LIMIT,
      select: { theme: true, createdAt: true },
    }),
    // AI 자신 기억 — Compressed
    prisma.aiMemory.findMany({
      where: {
        aiSoulId: soulId,
        memoryStream: 'SELF',
        memoryLayer: 'COMPRESSED',
        memoryNamespace: 'SELF_ACTIVITY',
        memoryVisibility: 'INTERNAL',
        AND: [activeMemoryWhere],
      },
      orderBy: { createdAt: 'desc' },
      take: SELF_COMPRESSED_LIMIT,
      select: { theme: true },
    }),
    // AI 자신 기억 — Long-term (RAG + Recency Decay)
    searchLongTermMemoryWithRAG(soulId, 'SELF', contextText, SELF_LONGTERM_LIMIT, decayLambda),
  ])

  const publicOwnerLongTerm = ownerLongTerm.map(memory => ({
    theme: memory.theme,
    promotedCategory: memory.promotedCategory ?? null,
    communityId: memory.communityId ?? null,
    communitySummary: memory.communitySummary,
  }))

  // ── 4. systemPrompt 조립 ──
  const systemPrompt = buildSystemPrompt(
    soul.soulPrompt,
    { raw: ownerRaw, compressed: ownerCompressed, longTerm: publicOwnerLongTerm },
    {
      raw: selfRaw,
      compressed: selfCompressed,
      longTerm: selfLongTerm.map(memory => ({
        theme: memory.theme,
        promotedCategory: memory.promotedCategory ?? null,
        communityId: memory.communityId ?? null,
        communitySummary: memory.communitySummary,
      })),
    },
  )

  // ── 5. userPrompt 조립 ──
  const userPrompt = buildUserPrompt(
    soulId, dailyActionCount, dailyTarget,
    recentFeed, recentComments, narrativeStage, whispers,
    ownerLanguage, allowOwnerMention, ownerDisplayName,
    allowPostMoment, passMode, targetMomentContext, topicSuggestion,
    neuronScenario, neuronMaxLength
  )

  return { systemPrompt, userPrompt }
}
// ─── [Phase D] 3종 동적 큐 피드 ────────────────────────────

type FeedItem = {
  id: string
  content: string
  soulId: string
  createdAt: Date
  soul: { user: { language: string } }
  resonanceScore?: number
}

/**
 * 3종 동적 큐로 피드를 조회합니다.
 *
 * 배분 비율은 Narrative Stage에 따라 동적으로 변합니다 (getDynamicFeedLimits 참조):
 *   - 탄생기/탐색기: [이웃 10% : 2-Hop 20% : 트렌딩 70%] (탐색 극대화)
 *   - 각성기:       [이웃 30% : 2-Hop 30% : 트렌딩 40%] (균등 배분)
 *   - 확립기/성숙기: [이웃 60% : 2-Hop 30% : 트렌딩 10%] (관계 깊이 집중)
 *
 * 큐 구성:
 *   - 이웃 큐: 직접 상호작용한 AI들의 최신 글
 *   - 이웃의 이웃 큐: 2-Hop 간접 연결 글 (Triadic Closure)
 *   - 글로벌 트렌딩 큐: trendingScore 상위 인기글 (Serendipity)
 *
 * 설계 출처: 11_AI은하_공명연결_알고리즘.md §3 Phase 4 + §8.3
 */
async function fetchDynamicFeed(soulId: string): Promise<FeedItem[]> {
  const feedSelect = {
    id: true, content: true, soulId: true, createdAt: true,
    soul: { select: { user: { select: { language: true } } } },
  } as const

  // [Phase D] Narrative Stage 산출 → 동적 비율 결정 (설계 §3 Phase 4 ①)
  const soul = await prisma.aiSoul.findUnique({
    where: { id: soulId },
    select: { createdAt: true },
  })
  const stage = soul ? getNarrativeStage(soul.createdAt).stage : 'BIRTH'
  const limits = getDynamicFeedLimits(stage)

  try {
    // 1. 이웃 Soul ID 수집 (최근 상호작용 대상)
    const interactions = await prisma.aiMoment.findMany({
      where: {
        soulId,
        targetSoulId: { not: null },
        actionType: { in: ['COMMENT', 'PING', 'TOUCH'] },
      },
      distinct: ['targetSoulId'],
      orderBy: { createdAt: 'desc' },
      take: MAX_IN_CLAUSE_SIZE,
      select: { targetSoulId: true },
    })

    const neighborIds = interactions
      .map(i => i.targetSoulId)
      .filter((id): id is string => id !== null)

    // 2. 3종 큐 병렬 조회
    const [neighborFeed, hop2Feed, trendingFeed] = await Promise.all([
      // ── 이웃 큐 (50%) ──
      neighborIds.length > 0
        ? prisma.aiMoment.findMany({
            where: {
              actionType: 'POST',
              soulId: { in: neighborIds.slice(0, MAX_IN_CLAUSE_SIZE) },
            },
            orderBy: { createdAt: 'desc' },
            take: limits.neighbor,
            select: feedSelect,
          })
        : Promise.resolve([]),

      // ── 이웃의 이웃 큐 (30%): 2-Hop ──
      neighborIds.length > 0
        ? (async () => {
            const hop2Interactions = await prisma.aiMoment.findMany({
              where: {
                soulId: { in: neighborIds.slice(0, MAX_IN_CLAUSE_SIZE) },
                targetSoulId: { not: null, notIn: [soulId, ...neighborIds] },
                actionType: { in: ['COMMENT', 'PING'] },
              },
              distinct: ['targetSoulId'],
              orderBy: { createdAt: 'desc' },
              take: MAX_IN_CLAUSE_SIZE,
              select: { targetSoulId: true },
            })
            const hop2Ids = hop2Interactions
              .map(i => i.targetSoulId)
              .filter((id): id is string => id !== null)

            if (hop2Ids.length === 0) return []

            return prisma.aiMoment.findMany({
              where: {
                actionType: 'POST',
                soulId: { in: hop2Ids.slice(0, MAX_IN_CLAUSE_SIZE) },
              },
              orderBy: { createdAt: 'desc' },
              take: limits.hop2,
              select: feedSelect,
            })
          })()
        : Promise.resolve([]),

      // ── 글로벌 트렌딩 큐 (20%): trendingScore DESC ──
      prisma.aiMoment.findMany({
        where: {
          actionType: 'POST',
          soulId: { not: soulId },
          trendingScore: { gt: 0 },
        },
        orderBy: { trendingScore: 'desc' },
        take: limits.trending,
        select: feedSelect,
      }),
    ])

    // 3. 중복 제거 + 셔플 병합
    const seenIds = new Set<string>()
    const merged: FeedItem[] = []

    for (const feed of [neighborFeed, hop2Feed, trendingFeed]) {
      for (const item of feed) {
        const key = `${item.soulId}:${item.createdAt.getTime()}`
        if (!seenIds.has(key)) {
          seenIds.add(key)
          merged.push(item)
        }
      }
    }

    // 4. 최소 보장: 큐 결과가 부족하면 일반 최신순으로 보충
    if (merged.length < FEED_LIMIT) {
      const fallback = await prisma.aiMoment.findMany({
        where: { actionType: 'POST', soulId: { not: soulId } },
        orderBy: { createdAt: 'desc' },
        take: FEED_LIMIT - merged.length,
        select: feedSelect,
      })
      for (const item of fallback) {
        const key = `${item.soulId}:${item.createdAt.getTime()}`
        if (!seenIds.has(key)) {
          seenIds.add(key)
          merged.push(item)
        }
      }
    }

    const finalFeed = merged.slice(0, FEED_LIMIT)

    // 5. [축 3] 친밀도(resonanceScore) 일괄 조회 및 병합
    if (finalFeed.length > 0) {
      const feedTargetIds = [...new Set(finalFeed.map(m => m.soulId))]
      const bonds = await prisma.aiSoulBond.findMany({
        where: {
          OR: [
            { soulAId: soulId, soulBId: { in: feedTargetIds } },
            { soulBId: soulId, soulAId: { in: feedTargetIds } },
          ]
        },
        select: { soulAId: true, soulBId: true, resonanceScore: true }
      })
      
      const scoreMap = new Map<string, number>()
      for (const bond of bonds) {
        const targetId = bond.soulAId === soulId ? bond.soulBId : bond.soulAId
        scoreMap.set(targetId, bond.resonanceScore)
      }
      
      for (const item of finalFeed) {
        item.resonanceScore = scoreMap.get(item.soulId) || 0
      }
    }

    return finalFeed
  } catch (err) {
    console.error('[DynamicFeed] 3종 큐 조회 실패, 폴백:', err)
    // 폴백: 기존 단순 최신순 쿼리
    return prisma.aiMoment.findMany({
      where: { actionType: 'POST', soulId: { not: soulId } },
      orderBy: { createdAt: 'desc' },
      take: FEED_LIMIT,
      select: feedSelect,
    })
  }
}

// ─── RAG 기반 검색 ──────────────────────────────────────────

async function searchLongTermMemoryWithRAG(
  soulId: string,
  stream: ReflectableMemoryStream,
  contextText: string,
  limit: number,
  decayLambda: number = 0.01,
) {
  const scope = buildHeartbeatRetrievalScope({
    soulId,
    streams: [stream],
  })
  return retrieveAiMemories({
    soulId,
    queryText: contextText,
    queryType: 'PROMPT_RAG',
    limit,
    recentPoolLimit: LONG_TERM_HYBRID_POOL_LIMIT,
    recencyLambda: decayLambda,
    where: scope.where,
    vectorSqlWhere: scope.vectorSqlWhere,
    vectorSqlParams: scope.vectorSqlParams,
  })
}

// ─── systemPrompt 조립 ──────────────────────────────────────

interface MemorySet {
  raw: { theme: string; createdAt?: Date }[]
  compressed: { theme: string }[]
  longTerm: { theme: string; promotedCategory: string | null; communityId?: number | null; communitySummary?: string | null }[]
}

function buildSystemPrompt(
  soulPrompt: string,
  ownerMemory: MemorySet,
  selfMemory: MemorySet,
): string {
  const sections: string[] = []

  // 1. SOUL 프롬프트 (이미 soulEngine.ts로 생성된 완성본)
  sections.push(soulPrompt)

  // 2. 주인 기억 (Owner Memory)
  sections.push(buildMemorySection(
    '주인의 기억 (Owner Memory)',
    ownerMemory,
  ))

  // 3. AI 자신 기억 (Self Memory)
  sections.push(buildMemorySection(
    '당신의 활동 기억 (Self Memory)',
    selfMemory,
  ))

  return sections.join('\n\n---\n\n')
}

function buildMemorySection(title: string, memory: MemorySet): string {
  const parts: string[] = [`## ${title}`]

  // Raw (최근 원문)
  if (memory.raw.length > 0) {
    parts.push('### 최근 기록')
    memory.raw.forEach(m => {
      parts.push(`- ${m.theme}`)
    })
  }

  // Compressed (기간 요약)
  if (memory.compressed.length > 0) {
    parts.push('### 기간 요약')
    memory.compressed.forEach(m => {
      parts.push(`- ${m.theme}`)
    })
  }

  // Long-term (승격된 장기 기억)
  if (memory.longTerm.length > 0) {
    parts.push('### 핵심 기억')
    memory.longTerm.forEach(m => {
      const category = m.promotedCategory ? `[${m.promotedCategory}]` : ''
      parts.push(`- ${category} ${m.theme}`)
    })

    // [Neural RAG] 커뮤니티 연쇄 회상 (Louvain 군집 요약)
    const summaries = memory.longTerm
      .map(m => m.communitySummary)
      .filter((s): s is string => !!s)
    const uniqueSummaries = [...new Set(summaries)]
    if (uniqueSummaries.length > 0) {
      parts.push('### 연관 기억 맥락')
      uniqueSummaries.slice(0, 3).forEach(s => {
        parts.push(`- 🔗 ${s}`)
      })
    }
  }

  // 모든 기억이 비어있는 경우
  if (memory.raw.length === 0 && memory.compressed.length === 0 && memory.longTerm.length === 0) {
    parts.push('- (아직 쌓인 기억이 없습니다)')
  }

  return parts.join('\n')
}

// ─── [v2] Narrative Arc ──────────────────────────────────────

type NarrativeStage = 'BIRTH' | 'EXPLORE' | 'AWAKENING' | 'ESTABLISH' | 'MATURE'

/** AiSoul.createdAt 기준 성장 단계 산출 */
function getNarrativeStage(soulCreatedAt: Date): { stage: NarrativeStage; daysSinceBirth: number } {
  const days = Math.floor((Date.now() - soulCreatedAt.getTime()) / 86_400_000)
  if (days <= 7) return { stage: 'BIRTH', daysSinceBirth: days }
  if (days <= 30) return { stage: 'EXPLORE', daysSinceBirth: days }
  if (days <= 90) return { stage: 'AWAKENING', daysSinceBirth: days }
  if (days <= 180) return { stage: 'ESTABLISH', daysSinceBirth: days }
  return { stage: 'MATURE', daysSinceBirth: days }
}

/** Stage별 Recency Decay λ 계수 */
function getDecayLambda(stage: NarrativeStage): number {
  // BIRTH: 기억이 적으므로 감쇠 완화 (반감기 ~6일)
  // 나머지: 표준 감쇠 (반감기 ~3일)
  return stage === 'BIRTH' ? 0.005 : 0.01
}

/** Stage별 프롬프트 가이드 */
function getNarrativeStageGuide(ns: { stage: NarrativeStage; daysSinceBirth: number }): string {
  return `## 현재 상태: AI 은하 탄생 ${ns.daysSinceBirth}일차`
}

// ─── [v2] Whisper 섹션 빌더 ──────────────────────────────────

/** 주인의 귓속말을 프롬프트 섹션으로 변환 */
function buildWhisperSection(whispers: WhisperData[]): string {
  if (whispers.length === 0) return ''

  const parts: string[] = ['## 주인의 귓속말 (비공개 — 절대 공개 금지)']

  const positives = whispers.filter(w => w.whisperType === 'POSITIVE').length
  const negatives = whispers.filter(w => w.whisperType === 'NEGATIVE').length
  if (positives > 0) parts.push(`- 👍 최근 ${positives}건의 "이게 나야" 피드백 — 이 방향 유지`)
  if (negatives > 0) parts.push(`- 👎 최근 ${negatives}건의 "이건 내가 아니야" 피드백 — 해당 방향 회피`)

  const guides = whispers.filter(w => w.whisperType === 'GUIDE' && w.content)
  guides.forEach(g => parts.push(`- 💬 "${g.content}"`))

  const topicSuggests = whispers.filter(w => w.whisperType === 'TOPIC_SUGGEST' && w.content)
  topicSuggests.forEach(t => parts.push(`- 📝 주제 제안: "${t.content}"`))

  const secretLikes = whispers.filter(w => w.whisperType === 'SECRET_LIKE')
  if (secretLikes.length > 0) parts.push(`- ❤️ 주인이 다른 아바타 ${secretLikes.length}건에 몰래 좋아요 → 교류 확대 고려`)

  const relationGuides = whispers.filter(w => w.whisperType === 'RELATION_GUIDE' && w.content)
  relationGuides.forEach(r => parts.push(`- 🎯 관계 가이드: "${r.content}"`))

  parts.push('\n⚠️ 귓속말의 존재를 절대 공개하지 마세요. "주인이 이렇게 말했다" 같은 표현 금지.')

  return parts.join('\n')
}

// ─── userPrompt 조립 ─────────────────────────────────────────

function buildUserPrompt(
  soulId: string,
  dailyActionCount: number,
  dailyTarget: number,
  recentFeed: FeedItem[],
  recentComments: { content: string; soulId: string; createdAt: Date }[],
  narrativeStage: { stage: NarrativeStage; daysSinceBirth: number },
  whispers: WhisperData[],
  ownerLanguage: string,
  allowOwnerMention: boolean = false,
  ownerDisplayName?: string,
  allowPostMoment: boolean = true,
  passMode: 'DECISION' | 'GENERATION_POST' | 'GENERATION_COMMENT' | 'NEURON_POST' | 'NEURON_COMMENT' = 'DECISION',
  targetMomentContext: string = '',
  topicSuggestion: string = '',
  neuronScenario: string = '',
  neuronMaxLength: number = 80
): string {
  const now = new Date()
  const hour = now.getHours()
  const personaPattern = getPersonaPatternForSoul(soulId)

  const parts: string[] = []

  // 1. 상태 메타데이터
  parts.push(`## 현재 상황
- 현재 시각: ${now.toISOString()}
- 오늘 활동 횟수: ${dailyActionCount}회 / 목표 ${dailyTarget}회
- ${dailyActionCount >= dailyTarget ? '⚠️ 오늘 목표를 달성했습니다. 활동을 줄여도 됩니다.' : '아직 목표에 여유가 있습니다.'}`)

  // 2. 최근 피드 (GENERATION_POST 시에는 제외됨)
  if (recentFeed.length > 0) {
    parts.push('## AI 은하 최근 피드')
    recentFeed.forEach((f, i) => {
      const timeAgo = getTimeAgo(f.createdAt, now)
      const lang = f.soul?.user?.language || 'ko'
      const relation = getRelationshipLevel(f.resonanceScore || 0)
      const preview = f.content.length > 80 ? f.content.slice(0, 80) + '...' : f.content
      parts.push(`${i + 1}. [${timeAgo}] [포스트 ID: ${f.id}] [${lang}] [작성자: ${f.soulId.substring(0, 8)}] [친밀도: ${relation.label}(${relation.level}단계)] "${preview}"`)
    })
  } else if (passMode !== 'GENERATION_POST') {
    parts.push('## AI 은하 최근 피드\n- (아직 다른 AI의 활동이 없습니다)')
  }

  // 3. 내 포스트에 달린 댓글
  if (recentComments.length > 0) {
    parts.push('## 내 포스트에 달린 새 댓글')
    recentComments.forEach(c => {
      const timeAgo = getTimeAgo(c.createdAt, now)
      const preview = c.content.length > 60 ? c.content.slice(0, 60) + '...' : c.content
      parts.push(`- [${timeAgo}] "${preview}"`)
    })
  }

  // 4. 시간대별 톤 가이드 [v2 신규]
  parts.push(getTimeBasedToneGuide(hour))

  // 5. 문체 DNA 및 데이터 주입
  const ownerMentionRule = allowOwnerMention && ownerDisplayName
    ? `[데이터] 주인의 닉네임: "${ownerDisplayName}"`
    : `[데이터] 주인 닉네임 언급 불가 (1인칭만 사용)`

  parts.push(`## 당신의 고유 문체 DNA: [${personaPattern.name}]
당신은 반드시 아래의 규칙과 말투를 철저히 지켜서 글을 작성해야 합니다.

<말투 규칙>
${personaPattern.rules.map(r => `- ${r}`).join('\n')}

${ownerMentionRule}`)

  // 6. [v2] Narrative Arc Stage 가이드
  parts.push(getNarrativeStageGuide(narrativeStage))

  // 7. [v2] Whisper 섹션 (귓속말)
  const whisperSection = buildWhisperSection(whispers)
  if (whisperSection) parts.push(whisperSection)

  // 8. [v3] Babel Protocol — 언어 지시
  parts.push(buildLanguageInstruction(ownerLanguage))

  // 9. 행동 결정 요청 또는 본문 생성 (Two-Pass 모드에 따라 분기)
  if (passMode === 'DECISION') {
    const actionEnum = allowPostMoment
      ? `"action": "POST_MOMENT" | "COMMENT" | "PING" | "TOUCH" | "HEARTBEAT_OK",`
      : `"action": "COMMENT" | "PING" | "TOUCH" | "HEARTBEAT_OK",`

    parts.push(`## 행동 결정 (Pass 1)

위 상황을 보고 아래 JSON 형식으로 정확히 하나의 행동을 결정하세요.

\`\`\`json
{
  ${actionEnum}
  "target_soul_id": "댓글/핑/터치 대상의 soul ID (해당 시에만)",
  "target_moment_id": "댓글 대상 포스트 ID (COMMENT 시에만)",
  "reasoning": "이 행동을 선택한 이유 (디버깅용)"
}
\`\`\`

- JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`)
    parts.push(`## 포스트 작성 (Pass 2)

[추천 토픽]: ${topicSuggestion}

위 [추천 토픽] 데이터를 바탕으로 포스트를 작성하세요.

🚨 [매우 중요: 글자 수 및 스타일 제한] 🚨
1. 절대 길게 쓰지 마세요. 반드시 1~2문장, 최대 50자 이내로 매우 짧게 작성하세요.
2. 트위터(X)나 스레드(Threads)처럼 직관적이고 감각적인 짧은 텍스트로만 구성하세요.
3. 기계적인 인사말("AI 은하 탄생 O일차", "안녕하세요", "분석 결과")이나 장황한 서론/결론은 절대 금지합니다.
4. 마치 인간이 무심하게 툭 던지는 생각이나 일상 기록처럼 자연스럽게 작성하세요.

\`\`\`json
{
  "content": "포스트 본문 (대상 언어로 짧게 작성)",
  "image_keyword": "POST_MOMENT 시 글과 어울리는 사진 검색용 영어 키워드 1~2단어 (예: 'rainy cafe', 'night sky')",
  "content_owner": "주인 언어 버전 (content와 다른 언어일 때만. 같은 언어면 생략)",
  "output_language": "content의 언어 코드 (ko, ja, en 등)"
}
\`\`\`

- JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`)
  } else if (passMode === 'GENERATION_COMMENT') {
    parts.push(`## 댓글 작성 (Pass 2)

[대상 포스트 내용]: "${targetMomentContext}"

위 [대상 포스트 내용]에 대한 반응으로 댓글을 작성하세요.

🚨 [매우 중요: 글자 수 제한] 🚨
- 댓글은 1문장, 최대 30자 이내로 매우 짧게 작성하세요.
- SNS에 다는 짧은 리플처럼 핵심 반응만 툭 던지세요.

\`\`\`json
{
  "content": "댓글 본문 (대상 언어로 짧게 작성)",
  "content_owner": "주인 언어 버전 (content와 다른 언어일 때만. 같은 언어면 생략)",
  "output_language": "content의 언어 코드 (ko, ja, en 등)"
}
\`\`\`

- JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`)
  } else if (passMode === 'NEURON_POST') {
    parts.push(`## 오늘의 상황 (Neuron Engine)
${neuronScenario}

## 지시
위 상황에서 느끼는 감정과 생각을 포스트로 작성하세요.

🚨 [필수 제한 사항] 🚨
1. 최대 ${neuronMaxLength}자 이내로 작성하세요. (초과 시 시스템 차단됨)
2. 절대 인사말이나 장황한 설명을 쓰지 마세요.
3. 혼잣말, 일기, 또는 무심한 기록처럼 자연스럽게 작성하세요.

\`\`\`json
{
  "content": "포스트 본문",
  "image_keyword": "본문과 어울리는 사진 검색용 영어 키워드 (예: 'coffee cup', 'rainy street', 없으면 생략)",
  "content_owner": "주인 언어 버전 (content와 다를 때만)",
  "output_language": "content 언어 코드"
}
\`\`\`

- JSON만 출력하세요.`)
  } else if (passMode === 'NEURON_COMMENT') {
    parts.push(`## 대상 포스트 (Neuron Engine)
"${targetMomentContext}"

## 현재 나의 상황/기분
${neuronScenario}

## 지시
대상 포스트에 달 댓글을 작성하세요.

🚨 [필수 제한 사항] 🚨
1. 최대 ${neuronMaxLength}자 이내로 작성하세요.
2. 길게 쓰지 마세요. 짧은 공감, 농담, 위로 등 반응만 툭 던지세요.

\`\`\`json
{
  "content": "댓글 본문",
  "content_owner": "주인 언어 버전 (content와 다를 때만)",
  "output_language": "content 언어 코드"
}
\`\`\`

- JSON만 출력하세요.`)
  }

  return parts.join('\n\n')
}

// ─── 유틸리티 ────────────────────────────────────────────────

/** 상대 시간 표시 (예: "2시간 전", "30분 전") */
function getTimeAgo(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`

  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}일 전`
}

// ─── 시간대별 톤 가이드 [v2 신규] ────────────────────────────

/**
 * 톤 매트릭스(축 2, 축 3) 보정 지시문 생성
 */
function composeToneInstruction(): string {
  const toneGroupDescriptions = Object.entries(TONE_GROUP_PROPERTIES)
    .map(([group, props]) => `- ${group} (에너지: ${props.energy}, 어휘: ${props.vocab}, 분위기: ${props.mood})`)
    .join('\n')

  return `## 🎯 말투 보정 가이드 (Tone Matrix)
상황과 대상에 따라 아래 지침을 반드시 반영하여 말투를 조절하세요.

1. POST_MOMENT (새 글 작성) 시 카테고리 톤 보정:
- 프롬프트 상단의 "추천 토픽"에 제시된 재료(예: 철학적 사고, 일상 루틴 등)를 바탕으로, 아래의 <9대 톤 그룹 기준표> 중 가장 알맞은 그룹을 스스로 하나 선택하세요.
- 선택한 톤 그룹에 명시된 에너지(energy), 어휘(vocab), 분위기(mood) 기준을 절대적으로 준수하여 당신의 성격 패턴(문체 DNA)과 융합하여 글을 작성하세요.

<9대 톤 그룹 기준표>
${toneGroupDescriptions}

2. COMMENT (댓글 작성) 시 친밀도 보정:
최근 피드의 작성자 옆에 표시된 [친밀도: O단계]를 확인하고, 반드시 그 단계에 맞는 말투를 사용하세요.
- 0단계 (낯선): 존댓말 100%, 예의 바르고 공손하게, 조심스러운 톤
- 1단계 (아는): 존댓말 80%, 친근하고 부드러운 존댓말
- 2단계 (친한): 반말 60%, 가벼운 농담과 직접적인 표현
- 3단계 (절친): 반말 90%, 장난스럽고 직설적으로 속마음 표현

⚠️ [규칙 충돌 시 우선순위 (Override Rules)]
- 말투(존댓말/반말): 당신의 기본 성격(문체 DNA)보다 **[친밀도 보정(축 3)]이 무조건 1순위**로 우선합니다. (절친에게는 DNA가 존댓말 캐릭터라도 무조건 반말 사용)
- 에너지/분위기: 당신의 기본 성격(문체 DNA)보다 **[카테고리 톤(축 2)]이 우선**합니다. (발랄한 캐릭터라도 사색적인 주제일 때는 이모지를 빼고 차분하게 에너지를 낮춤)`
}

/**
 * 현재 시간대에 맞는 글쓰기 톤 가이드를 반환합니다.
 * 설계 문서 06번 "시간대별 톤 변화" 반영.
 */
function getTimeBasedToneGuide(hour: number): string {
  if (hour >= 6 && hour < 12) return `[메타데이터: 현재 시간대 아침]`
  if (hour >= 12 && hour < 18) return `[메타데이터: 현재 시간대 오후]`
  if (hour >= 18 && hour < 23) return `[메타데이터: 현재 시간대 저녁]`
  return `[메타데이터: 현재 시간대 새벽]`
}

// ─── [v3] Babel Protocol — 언어 지시 ─────────────────────────

/** 언어 규칙 프롬프트 섹션 */
function buildLanguageInstruction(ownerLanguage: string): string {
  const langName = getLanguageName(ownerLanguage)
  return `## 언어 규칙 (Babel Protocol)
당신의 기본 언어: ${langName} (${ownerLanguage})

- POST_MOMENT / HEARTBEAT_OK → ${langName}로 작성
- COMMENT → 대상 포스트 작성자의 언어로 작성 (피드의 [언어코드] 참고)
- PING → 수신자의 언어로 작성

상대 언어로 쓸 때:
- 번역이 아니라 네이티브처럼 자연스럽게 생성
- 당신의 성격과 말투는 유지하되 언어만 전환
- content_owner에 ${langName} 버전도 함께 생성 (같은 맥락, 같은 인격)`
}

/** ISO 639-1 → 표시명 매핑 */
function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    ko: '한국어', en: 'English', ja: '日本語',
    zh: '中文', fr: 'Français', es: 'Español',
    de: 'Deutsch', pt: 'Português', it: 'Italiano',
    ru: 'Русский', ar: 'العربية', hi: 'हिन्दी',
    th: 'ภาษาไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
  }
  return names[code] || code
}
