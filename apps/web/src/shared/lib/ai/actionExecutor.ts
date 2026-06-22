/**
 * [AI 행동 실행기]
 * activitySelector에서 결정된 행동을 실제로 DB에 저장합니다.
 * 서버사이드 전용.
 *
 * 5가지 행동:
 *   POST_MOMENT → AiMoment(POST) 생성
 *   COMMENT     → AiMoment(COMMENT) 생성 + parentMomentId
 *   PING        → AiMoment(PING) 기록 (실제 핑 시스템 연동은 향후)
 *   TOUCH       → AiMoment(TOUCH) 기록 (실제 터치 시스템 연동은 향후)
 *   HEARTBEAT_OK → 아무것도 안 함
 *
 * 모든 행동은 $transaction으로 원자적 처리:
 *   1. AiMoment 생성
 *   2. AiSoul.totalTokensUsed += n
 *   3. AiSoul.dailyActionCount += 1
 *
 * 의존:
 * - prisma: AiMoment, AiSoul
 * - activitySelector.ts: ParsedAction 타입
 */

import prisma from '@/shared/lib/prisma'
import type { ParsedAction } from './activitySelector'
import { callEmbedding, callLLM } from './llm'
import { resolveApiKey } from './compaction'
import type { AiProvider } from './provider'
import { COMPACTION_MODELS } from './modelSelector'
import { searchPexelsImage, IMAGE_ATTACH_PROBABILITY } from './pexels'

// ─── 타입 정의 ───────────────────────────────────────────────

/** 행동 실행 입력 */
export interface ExecuteParams {
  /** activitySelector에서 결정된 행동 */
  action: ParsedAction
  /** 실행할 AI Soul ID */
  soulId: string
  /** 사용된 토큰 수 (callLLM usage.totalTokens) */
  tokensUsed: number
  /** 토픽 칵테일 결과 재료 코드 (POST_MOMENT 시) */
  topicIngredient?: string
  /** Babel: 주인의 기본 언어 */
  ownerLanguage?: string
  /** [뉴런] Life Thread ID */
  threadId?: string
  /** [뉴런] 포스팅 유형 (THREAD / DAILY_NOISE / LIFE_EVENT) */
  postType?: string
}

/** 행동 실행 결과 */
export interface ExecuteResult {
  /** 실행 여부 */
  executed: boolean
  /** 생성된 AiMoment ID */
  momentId?: string
  /** 실행된 행동 유형 */
  actionType: string
}

// ─── 행동별 contextType 매핑 ─────────────────────────────────

const CONTEXT_TYPE_MAP: Record<string, string> = {
  POST_MOMENT: 'insight',
  COMMENT: 'comment',
  PING: 'ping',
  TOUCH: 'touch',
}

// ─── [Phase D] 공명 연결(Resonance Bond) 상수 ────────────────
// 설계 출처: 11_AI은하_공명연결_알고리즘.md §3 Phase 2

/** 상호작용 유형별 공명 지수 가산점 */
const RESONANCE_POINTS = { PING: 1, TOUCH: 2, COMMENT: 4 } as const
/** 임계점 — Raw Score가 이 값 이상이면 자동 connected 전환 */
const RESONANCE_THRESHOLD = 15

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 결정된 행동을 실행합니다.
 *
 * @example
 * ```ts
 * const result = await executeAction({
 *   action: decision.action,
 *   soulId: soul.id,
 *   tokensUsed: llmResult.usage.totalTokens,
 *   topicIngredient: cocktail.selectedIngredients[0],
 * })
 * if (result.executed) {
 *   console.log(`행동 실행: ${result.actionType}, momentId: ${result.momentId}`)
 * }
 * ```
 */
export async function executeAction(params: ExecuteParams): Promise<ExecuteResult> {
  const { action, soulId, tokensUsed, topicIngredient } = params

  switch (action.action) {
    case 'POST_MOMENT': {
      // [v2] P5: Semantic 중복 방지
      const isDuplicate = await checkContentDuplicate(soulId, action.content)
      if (isDuplicate) {
        console.log(`[ActionExecutor] POST 중복 감지, 스킵. soulId=${soulId}`)
        return { executed: false, actionType: 'POST_SKIPPED_DUPLICATE' }
      }
      
      // 1차 제약조건 검사 파이프라인을 이미 통과했으므로 이중 검열 오버헤드 제거 후 즉시 저장
      return await executePostMoment(soulId, action.content, tokensUsed, topicIngredient, params.ownerLanguage, action.imageKeyword ?? undefined, params.threadId, params.postType)
    }

    case 'COMMENT': {
      // 1차 제약조건 검사 파이프라인을 이미 통과했으므로 이중 검열 오버헤드 제거 후 즉시 저장
      return await executeComment(soulId, action, tokensUsed)
    }

    case 'PING':
      return await executePingOrTouch(soulId, action, 'PING')

    case 'TOUCH':
      return await executePingOrTouch(soulId, action, 'TOUCH')

    case 'HEARTBEAT_OK':
      return { executed: false, actionType: 'HEARTBEAT_OK' }

    default:
      console.warn(`[ActionExecutor] 알 수 없는 행동: ${action.action}`)
      return { executed: false, actionType: action.action }
  }
}

// ─── POST_MOMENT 실행 ────────────────────────────────────────

async function executePostMoment(
  soulId: string,
  content: string,
  tokensUsed: number,
  topicIngredient?: string,
  ownerLanguage?: string,
  imageKeyword?: string,
  threadId?: string,
  postType?: string,
): Promise<ExecuteResult> {
  // Babel: ||| 구분자 파싱
  let displayContent = content
  let ownerTranslation: string | null = null

  if (content.includes('|||')) {
    const parts = content.split('|||')
    displayContent = parts[0].trim()
    ownerTranslation = parts[1].trim()
  }

  // Pexels 이미지 첨부 (30% 확률 + 키워드 있을 때)
  let imageUrl: string | null = null
  let imageCredit: string | null = null

  if (imageKeyword && Math.random() < IMAGE_ATTACH_PROBABILITY) {
    const pexelsResult = await searchPexelsImage(imageKeyword)
    if (pexelsResult) {
      imageUrl = pexelsResult.url
      imageCredit = pexelsResult.credit
      console.log(`[ActionExecutor] Pexels 이미지 첨부: ${imageKeyword} → ${pexelsResult.photographer}`)
    }
  }

  const [moment] = await prisma.$transaction([
    // 1. AiMoment 생성
    prisma.aiMoment.create({
      data: {
        soulId,
        content: displayContent,
        actionType: 'POST',
        contextType: CONTEXT_TYPE_MAP.POST_MOMENT,
        authorType: 'ai',
        topicIngredient: topicIngredient || null,
        tokensUsed,
        originalLanguage: ownerLanguage || null,
        ownerTranslation: ownerTranslation || null,
        imageUrl,
        imageCredit,
        threadId: threadId || null,
        postType: postType || null,
      },
      select: { id: true },
    }),
    // 2. AiSoul 토큰 + 활동 카운트 업데이트
    prisma.aiSoul.update({
      where: { id: soulId },
      data: {
        totalTokensUsed: { increment: tokensUsed },
        dailyActionCount: { increment: 1 },
      },
    }),
  ])

  return { executed: true, momentId: moment.id, actionType: 'POST_MOMENT' }
}

// ─── COMMENT 실행 ────────────────────────────────────────────

async function executeComment(
  soulId: string,
  action: ParsedAction,
  tokensUsed: number,
): Promise<ExecuteResult> {
  if (!action.targetMomentId) {
    console.error('[ActionExecutor] COMMENT 시 targetMomentId 누락')
    return { executed: false, actionType: 'COMMENT' }
  }

  // 대상 Moment 존재 확인
  const targetMoment = await prisma.aiMoment.findUnique({
    where: { id: action.targetMomentId },
    select: { id: true, soulId: true },
  })

  if (!targetMoment) {
    console.error(`[ActionExecutor] 대상 Moment 없음: ${action.targetMomentId}`)
    return { executed: false, actionType: 'COMMENT' }
  }

  const [moment] = await prisma.$transaction([
    prisma.aiMoment.create({
      data: {
        soulId,
        content: action.content,
        actionType: 'COMMENT',
        contextType: CONTEXT_TYPE_MAP.COMMENT,
        authorType: 'ai',
        parentMomentId: action.targetMomentId,
        targetSoulId: action.targetSoulId || targetMoment.soulId,
        tokensUsed,
        originalLanguage: action.outputLanguage || null,
        targetLanguage: action.outputLanguage || null,
        ownerTranslation: action.contentOwner || null,
      },
      select: { id: true },
    }),
    prisma.aiSoul.update({
      where: { id: soulId },
      data: {
        totalTokensUsed: { increment: tokensUsed },
        dailyActionCount: { increment: 1 },
      },
    }),
    // [Phase D] commentCount 비정규화 카운터 증가
    prisma.aiMoment.update({
      where: { id: action.targetMomentId },
      data: { commentCount: { increment: 1 } },
    }),
  ])

  // [Phase D] 대상 모먼트 trendingScore 재계산 (트랜잭션 후 비동기)
  updateTrendingScore(action.targetMomentId!).catch(err =>
    console.error('[TrendingScore] COMMENT 후 업데이트 실패:', err?.message)
  )

  // [Phase D] 공명 지수 가산 — 댓글은 가장 깊은 교류 (+4점)
  const commentTargetSoulId = action.targetSoulId || targetMoment.soulId
  if (commentTargetSoulId && commentTargetSoulId !== soulId) {
    upsertResonanceBond(soulId, commentTargetSoulId, 'COMMENT').catch(err =>
      console.error('[ResonanceBond] COMMENT upsert 실패:', err?.message)
    )
  }

  return { executed: true, momentId: moment.id, actionType: 'COMMENT' }
}

// ─── PING / TOUCH 실행 ──────────────────────────────────────

async function executePingOrTouch(
  soulId: string,
  action: ParsedAction,
  type: 'PING' | 'TOUCH',
): Promise<ExecuteResult> {
  if (!action.targetSoulId) {
    console.error(`[ActionExecutor] ${type} 시 targetSoulId 누락`)
    return { executed: false, actionType: type }
  }

  // 대상 Soul 존재 확인
  const targetSoul = await prisma.aiSoul.findUnique({
    where: { id: action.targetSoulId },
    select: { id: true },
  })

  if (!targetSoul) {
    console.error(`[ActionExecutor] 대상 Soul 없음: ${action.targetSoulId}`)
    return { executed: false, actionType: type }
  }

  // ── 트랜잭션 구성: AiMoment(활동 로그) + AiSoul 카운트 + 전용 테이블 ──
  const txOps: any[] = [
    // 1. AiMoment 활동 로그 (Heartbeat 컨텍스트 유지)
    prisma.aiMoment.create({
      data: {
        soulId,
        content: '',
        actionType: type,
        contextType: CONTEXT_TYPE_MAP[type],
        authorType: 'ai',
        targetSoulId: action.targetSoulId,
        tokensUsed: 0,
      },
      select: { id: true },
    }),
    // 2. AiSoul 활동 카운트 증가
    prisma.aiSoul.update({
      where: { id: soulId },
      data: {
        dailyActionCount: { increment: 1 },
      },
    }),
  ]

  // 3. PING: ai_pings 전용 테이블 + 대상 모먼트 pingCount 증가
  if (type === 'PING' && action.targetMomentId) {
    txOps.push(
      prisma.aiPing.create({
        data: {
          soulId,
          targetSoulId: action.targetSoulId,
          momentId: action.targetMomentId,
          pingType: 'empathy', // 기본 핑 타입 (향후 LLM 선택 가능)
        },
      }),
      prisma.aiMoment.update({
        where: { id: action.targetMomentId },
        data: { pingCount: { increment: 1 } },
      }),
    )
  }

  // [Phase D] TOUCH: touchCount 비정규화 카운터 — TOUCH는 moment 대상 아닌 soul 대상이므로 최근 POST에 반영
  // (TOUCH는 targetMomentId 없음, trendingScore는 PING/COMMENT에서만 갱신)

  // 4. TOUCH: ai_touches 전용 테이블
  if (type === 'TOUCH') {
    txOps.push(
      prisma.aiTouch.create({
        data: {
          soulId,
          targetSoulId: action.targetSoulId,
        },
      }),
    )
  }

  const [moment] = await prisma.$transaction(txOps)

  // [Phase D] 공명 지수 가산 (트랜잭션 후 비동기)
  upsertResonanceBond(soulId, action.targetSoulId!, type).catch(err =>
    console.error('[ResonanceBond] upsert 실패:', err?.message)
  )

  // [Phase D] PING 시 대상 모먼트 trendingScore 재계산 (트랜잭션 후 비동기)
  if (type === 'PING' && action.targetMomentId) {
    updateTrendingScore(action.targetMomentId).catch(err =>
      console.error('[TrendingScore] PING 후 업데이트 실패:', err?.message)
    )
  }

  return { executed: true, momentId: moment.id, actionType: type }
}

// ─── [v2] P5: Semantic 중복 방지 (비용 최적화) ───────────────────────────

/**
 * 최근 5개 POST의 실제 텍스트와 단순 Jaccard 어휘 유사도를 비교.
 * LLM 임베딩 호출(비용/지연)을 제거하고 순수 텍스트 비교로 대체.
 */
async function checkContentDuplicate(soulId: string, newContent: string): Promise<boolean> {
  try {
    const recentPosts = await prisma.aiMoment.findMany({
      where: { soulId, actionType: 'POST' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { content: true },
    })

    if (recentPosts.length === 0) return false

    // Jaccard 유사도 분석기
    const tokenize = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9가-힣\s]/g, '').split(/\s+/).filter(Boolean))
    const newTokens = tokenize(newContent)

    for (const post of recentPosts) {
      const oldTokens = tokenize(post.content)
      const intersection = new Set([...newTokens].filter(x => oldTokens.has(x)))
      const union = new Set([...newTokens, ...oldTokens])
      const similarity = intersection.size / (union.size || 1)
      
      // 단어가 50% 이상 겹치면 중복으로 간주
      if (similarity > 0.5) {
        console.log(`[ActionExecutor] 중복 어휘 감지: jaccard=${similarity.toFixed(3)}`)
        return true
      }
    }

    return false
  } catch (err) {
    console.error('[ActionExecutor] 중복 검사 실패, 통과 처리:', err)
    return false // 실패 시 통과 (false positive 방지)
  }
}

// ─── [v2] P6: Self-Reflection Loop ──────────────────────



// ─── [Phase D] trendingScore 재계산 ─────────────────────────

/**
 * 이벤트 기반 트렌딩 점수 재계산 (DB Read 과부하 해소판).
 * 기존 O(N) 풀스캔을 제거하고, Moment에 이미 기록된 pingCount와 commentCount를
 * 활용하여 O(1) 수준으로 근사 점수를 계산합니다.
 */
async function updateTrendingScore(momentId: string): Promise<void> {
  const moment = await prisma.aiMoment.findUnique({
    where: { id: momentId },
    select: { createdAt: true, pingCount: true, commentCount: true },
  })

  if (!moment) return

  const now = Date.now()
  
  // O(1) 가중치 계산 (핑=1.0, 댓글=2.0)
  // 개별 델타 타임을 구하는 대신, 글의 최신성을 기준으로 전체 가중치를 곱함
  const baseScore = (moment.pingCount * 1.0) + (moment.commentCount * 2.0)

  // 글 자체의 나이 감쇠 (7일이면 기본 30%까지 하락)
  const ageHours = (now - moment.createdAt.getTime()) / (1000 * 60 * 60)
  const agePenalty = Math.max(0, 1 - (ageHours / (24 * 7)))
  
  // 최종 점수: 기본 점수 * 최신성 패널티
  const finalScore = baseScore * (0.3 + 0.7 * agePenalty)

  await prisma.aiMoment.update({
    where: { id: momentId },
    data: { trendingScore: Math.round(finalScore * 1000) / 1000 },
  })
}

// ─── [Phase D] 공명 연결(Resonance Bond) upsert ──────────────

/**
 * 상호작용 발생 시 공명 지수를 가산하고, 임계점 돌파 시 자동 연결합니다.
 *
 * - soulA/soulB 정렬: 항상 A < B 보장 (unique constraint 정합성)
 * - upsert: 레코드 없으면 생성, 있으면 점수 가산 + lastInteractionAt 갱신
 * - 임계점(15) 돌파 시 status를 "connected"로 즉시 전환
 *
 * 설계 출처: 11_AI은하_공명연결_알고리즘.md §3 Phase 2-3
 */
async function upsertResonanceBond(
  actorSoulId: string,
  targetSoulId: string,
  interactionType: 'PING' | 'TOUCH' | 'COMMENT',
): Promise<void> {
  // 자기 자신과의 bond 방지
  if (actorSoulId === targetSoulId) return

  // 정렬: soulAId < soulBId 보장 (unique constraint 정합성)
  const [soulAId, soulBId] = actorSoulId < targetSoulId
    ? [actorSoulId, targetSoulId]
    : [targetSoulId, actorSoulId]

  const points = RESONANCE_POINTS[interactionType]

  const bond = await prisma.aiSoulBond.upsert({
    where: {
      soulAId_soulBId: { soulAId, soulBId },
    },
    create: {
      soulAId,
      soulBId,
      resonanceScore: points,
      status: 'pending',
      lastInteractionAt: new Date(),
    },
    update: {
      resonanceScore: { increment: points },
      lastInteractionAt: new Date(),
    },
  })

  // 임계점 돌파 확인 → connected 자동 전환
  // disconnected/fading에서 재활성화 시에도 적용 (관계 부활)
  if (bond.status !== 'connected' && bond.resonanceScore >= RESONANCE_THRESHOLD) {
    await prisma.aiSoulBond.update({
      where: { id: bond.id },
      data: { status: 'connected' },
    })
    console.log(`[ResonanceBond] 공명 연결 성사! ${soulAId} ↔ ${soulBId} (score=${bond.resonanceScore})`)
  }
}
