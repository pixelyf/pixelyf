/**
 * [기억 압축 엔진]
 * Reflection 배치에서 Raw 기억을 Compressed로 압축합니다.
 * Flash 모델(저렴)을 사용하여 비용 절감.
 * 서버사이드 전용.
 *
 * 사용처:
 * - Reflection Light (매 24시간): 당일 Raw → 일별 요약
 * - Reflection REM (매 3일): 일별 요약 3건 → 기간 요약 1건
 *
 * 의존:
 * - llm.ts: callLLM() (이미 구현됨)
 * - modelSelector.ts: COMPACTION_MODELS (Flash 모델)
 * - crypto.ts: decryptApiKey
 * - provider.ts: AiProvider
 *
 * 원칙:
 * - 원본(Raw)은 절대 삭제하지 않음 (조회 범위에서만 제외)
 * - 압축 실패 시에도 원본 보존 (압축만 스킵)
 */

import prisma from '@/shared/lib/prisma'
import { callLLM, callEmbedding } from './llm'
import { decryptApiKey } from './crypto'
import { COMPACTION_MODELS } from './modelSelector'
import { recordMemoryTrace } from './memoryTrace'
import type { AiProvider } from './provider'
import type { MemoryMetadata, ReflectableMemoryStream } from './memoryPolicy'
import { buildMemoryWritePlan } from './memoryWriteGate'

// ─── 타입 정의 ───────────────────────────────────────────────

/** 압축 대상 원본 기억 */
export interface RawMemoryInput {
  id: string
  theme: string
}

/** 압축 결과 */
export interface CompactionResult {
  /** 압축된 요약 텍스트 */
  compressedTheme: string
  /** 처리된 Raw 건수 */
  inputCount: number
  /** 사용된 토큰 수 */
  tokensUsed: number
  /** [v2] LLM이 평가한 중요도 (1~10) */
  importanceScore: number
}

/** compactMemories 입력 파라미터 */
export interface CompactParams {
  /** AI Soul ID */
  soulId: string
  /** 기억 스트림: OWNER (주인 기억) / SELF (AI 자신 기억) */
  stream: ReflectableMemoryStream
  /** 압축할 Raw 기억 목록 */
  rawMemories: RawMemoryInput[]
  /** 압축 결과의 출처 표시 */
  source?: string
  metadata?: MemoryMetadata
}

// ─── 상수 ────────────────────────────────────────────────────

/** 압축 출력 최대 토큰 (~50토큰, 간결한 요약) */
const COMPACTION_MAX_TOKENS = 100
/** 압축 온도 (낮을수록 일관된 요약) */
const COMPACTION_TEMPERATURE = 0.3

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * Raw 기억 N건을 하나의 Compressed 요약으로 압축합니다.
 *
 * @example
 * ```ts
 * const rawMemories = await prisma.aiMemory.findMany({
 *   where: { aiSoulId: soulId, memoryStream: 'SELF', memoryLayer: 'RAW' },
 *   select: { id: true, theme: true },
 * })
 * const result = await compactMemories({
 *   soulId,
 *   stream: 'SELF',
 *   rawMemories,
 * })
 * ```
 */
export async function compactMemories(params: CompactParams): Promise<CompactionResult> {
  const { soulId, stream, rawMemories, source = 'SNS_ACTIVITY', metadata } = params

  // 빈 배열 → 압축 불필요
  if (rawMemories.length === 0) {
    return { compressedTheme: '', inputCount: 0, tokensUsed: 0, importanceScore: 0 }
  }

  // 1. 사용자 API 키 조회 + 복호화
  const { apiKey, provider } = await resolveApiKey(soulId)

  // 3. Flash 모델로 LLM 호출 (요약 + 중요도 JSON 1회 통합)
  // 기존: callLLM(요약) + evaluateImportance(callLLM) = 2회 순차 호출 → 병목
  // 수정: Structured Output으로 1회 호출 → API 비용/지연 50% 절감
  const compactionModel = COMPACTION_MODELS[provider]
  const result = await callLLM({
    apiKey,
    provider,
    model: compactionModel,
    systemPrompt: buildCompactionSystemPrompt(stream),
    userPrompt: buildCompactionUserPrompt(rawMemories),
    responseFormat: 'json',
    temperature: COMPACTION_TEMPERATURE,
    maxOutputTokens: COMPACTION_MAX_TOKENS,
    thinkingBudget: 0,
  })

  // 4. JSON 파싱 (요약 + 중요도 동시 추출)
  let compressedTheme: string
  let importance: number
  try {
    const parsed = JSON.parse(result.content.trim())
    compressedTheme = parsed.summary || result.content.trim()
    const rawScore = parseInt(parsed.importance, 10)
    importance = isNaN(rawScore) ? 5 : Math.max(1, Math.min(10, rawScore))
  } catch {
    // JSON 파싱 실패 시 원본 텍스트를 요약으로 사용, 중요도 기본값
    compressedTheme = result.content.trim()
    importance = 5
  }

  // 5. Compressed 기억을 DB에 저장 (importanceScore 동적 반영)
  const plan = buildMemoryWritePlan({
    aiSoulId: soulId,
    memoryStream: stream,
    memoryLayer: 'COMPRESSED',
    theme: compressedTheme,
    source,
    metadata,
    importanceScore: importance,
    policySource: 'REFLECTION',
    mergedFrom: rawMemories.map((memory) => memory.id),
    provenance: {
      originType: 'REFLECTION',
      originId: source,
      derivedFromMemoryIds: rawMemories.map((memory) => memory.id),
      mergeReason: `COMPACTION_${stream}_${source}`,
    },
  })
  if (!plan.data) {
    await recordMemoryTrace({
      soulId,
      stage: 'write_gate',
      traceKey: 'COMPACTION',
      status: 'blocked',
      payload: { action: plan.action, source, stream, inputCount: rawMemories.length },
    })
    throw new Error(`[Compaction] write gate blocked ${plan.action}`)
  }

  const sourceMemoryIds = rawMemories.map((rawMemory) => rawMemory.id)
  const memory = await prisma.$transaction(async (tx) => {
    const created = await tx.aiMemory.create({
      data: plan.data!,
    })
    if (sourceMemoryIds.length > 0) {
      await tx.aiMemoryDerivation.createMany({
        data: sourceMemoryIds.map((sourceMemoryId) => ({
          derivedMemoryId: created.id,
          sourceMemoryId,
        })),
      })
    }
    return created
  })
  await recordMemoryTrace({
    soulId,
    stage: 'write_gate',
    traceKey: 'COMPACTION',
    status: 'success',
    payload: { action: plan.action, memoryId: memory.id, source, stream, inputCount: rawMemories.length },
  })

  // 6. 임베딩 벡터 생성 및 저장 (pgvector)
  try {
    const vector = await callEmbedding(apiKey, provider, compressedTheme)
    if (vector && vector.length === 1536) {
      // Prisma Unsupported type은 $executeRawUnsafe 로 업데이트
      const vectorStr = `[${vector.join(',')}]`
      await prisma.$executeRawUnsafe(
        `UPDATE ai_memories SET embedding = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        memory.id
      )
    }
  } catch (err) {
    console.error('Embedding generation failed:', err)
  }

  return {
    compressedTheme,
    inputCount: rawMemories.length,
    tokensUsed: result.usage.totalTokens,
    importanceScore: importance,
  }
}

// ─── API 키 조회 ─────────────────────────────────────────────

/**
 * soulId → userId → AiProviderKey에서 활성 키를 찾아 복호화합니다.
 */
export async function resolveApiKey(soulId: string): Promise<{ apiKey: string; provider: AiProvider }> {
  const soul = await prisma.aiSoul.findUnique({
    where: { id: soulId },
    select: { userId: true },
  })

  if (!soul) {
    throw new Error(`AiSoul not found: ${soulId}`)
  }

  const providerKey = await prisma.aiProviderKey.findFirst({
    where: { userId: soul.userId, isActive: true },
    select: { provider: true, apiKeyEncrypted: true },
  })

  if (!providerKey) {
    throw new Error(`[resolveApiKey Error] 활성 API 키 레코드가 없습니다. userId=${soul.userId}`)
  }

  try {
    const apiKey = decryptApiKey(providerKey.apiKeyEncrypted)
    return { apiKey, provider: providerKey.provider as AiProvider }
  } catch (decryptErr: any) {
    throw new Error(`[resolveApiKey Decryption Error] API 키 복호화 실패: ${decryptErr.message}. userId=${soul.userId}`)
  }
}

/**
 * userId → AiProviderKey에서 활성 키를 찾아 복호화합니다.
 * 피드 번역 등 soulId 없이 userId만으로 키를 조회할 때 사용.
 */
export async function resolveApiKeyByUserId(
  userId: string,
): Promise<{ apiKey: string; provider: AiProvider }> {
  const providerKey = await prisma.aiProviderKey.findFirst({
    where: { userId, isActive: true },
    select: { provider: true, apiKeyEncrypted: true },
  })

  if (!providerKey) {
    throw new Error(`[resolveApiKeyByUserId Error] 활성 API 키 레코드가 없습니다. userId=${userId}`)
  }

  try {
    const apiKey = decryptApiKey(providerKey.apiKeyEncrypted)
    return { apiKey, provider: providerKey.provider as AiProvider }
  } catch (decryptErr: any) {
    throw new Error(`[resolveApiKeyByUserId Decryption Error] API 키 복호화 실패: ${decryptErr.message}. userId=${userId}`)
  }
}

// ─── 프롬프트 조립 ──────────────────────────────────────────

function buildCompactionSystemPrompt(stream: ReflectableMemoryStream): string {
  const subject = stream === 'OWNER' ? '주인(사용자)' : 'AI 자신'

  return `당신은 기억 압축 전문가입니다.
아래에 주어진 ${subject}의 활동 기록들을 하나의 간결한 요약으로 압축하고, 중요도를 평가하세요.

규칙:
1. 핵심 사실과 감정만 보존하세요.
2. 중요한 이름, 날짜, 키워드는 반드시 유지하세요.
3. 중복된 내용은 병합하세요.
4. summary는 50토큰 이내로 작성하세요.
5. 원본 기록과 동일한 언어로 작성하세요.
6. importance는 1(완전히 일상적)~10(인생을 바꿀 수 있는 것) 정수로 평가하세요.

JSON만 출력하세요:
{"summary": "간결한 요약", "importance": 숫자}`
}

function buildCompactionUserPrompt(rawMemories: RawMemoryInput[]): string {
  const items = rawMemories.map((m, i) => `${i + 1}. ${m.theme}`).join('\n')
  return `아래 ${rawMemories.length}건의 기록을 하나의 요약으로 압축하세요:\n\n${items}`
}

// ─── 카테고리 LLM 분류 ─────────────────────────────────────────

export async function classifyCategoryWithLLM(soulId: string, theme: string): Promise<'IDENTITY' | 'RELATIONSHIP' | 'EVENT'> {
  const { apiKey, provider } = await resolveApiKey(soulId)
  const compactionModel = COMPACTION_MODELS[provider]
  
  const systemPrompt = `당신은 기억 분류기입니다. 주어진 기억의 주제를 분석하여 다음 3가지 카테고리 중 하나로만 정확히 분류하세요.
- IDENTITY: AI 자신의 정체성, 성격, 개인적 취향과 관련된 내용
- RELATIONSHIP: 다른 사용자나 AI와의 교류, 대화, 관계, 감정적 연결과 관련된 내용
- EVENT: 새로운 시작, 중요한 사건, 상태 변화 등 뚜렷한 이벤트와 관련된 내용

오직 'IDENTITY', 'RELATIONSHIP', 'EVENT' 중 하나의 단어만 출력하세요. 다른 설명은 절대 추가하지 마세요.`

  const result = await callLLM({
    apiKey,
    provider,
    model: compactionModel,
    systemPrompt,
    userPrompt: `다음 기억을 분류하세요:\n\n${theme}`,
    responseFormat: 'text',
    temperature: 0.1,
    maxOutputTokens: 10,
    thinkingBudget: 0,
  })

  const output = result.content.trim().toUpperCase()
  if (output.includes('RELATIONSHIP')) return 'RELATIONSHIP'
  if (output.includes('EVENT')) return 'EVENT'
  return 'IDENTITY'
}

// ─── 기억 중요도 평가 [v2 신규] ─────────────────────────────

/**
 * Stanford Generative Agents 방식 Importance Scoring.
 * LLM이 기억의 중요도를 1~10점으로 평가합니다.
 * 1은 완전히 일상적인 것, 10은 극도로 감정적이거나 인생을 바꿀 수 있는 것.
 */
export async function evaluateImportance(
  apiKey: string,
  provider: AiProvider,
  theme: string,
): Promise<number> {
  try {
    const compactionModel = COMPACTION_MODELS[provider]
    const result = await callLLM({
      apiKey,
      provider,
      model: compactionModel,
      systemPrompt: `당신은 기억 중요도 평가자입니다.
1점(완전히 일상적인 것)부터 10점(극도로 감정적이거나 인생을 바꿀 수 있는 것)까지 점수를 매기세요.

숫자만 출력하세요. 다른 설명은 절대 추가하지 마세요.`,
      userPrompt: `다음 기억의 중요도를 평가하세요:\n\n${theme}`,
      responseFormat: 'text',
      temperature: 0.1,
      maxOutputTokens: 5,
      thinkingBudget: 0,
    })

    const score = parseInt(result.content.trim(), 10)
    if (isNaN(score)) return 5
    return Math.max(1, Math.min(10, score))
  } catch (err) {
    console.error('[Compaction] Importance evaluation failed, defaulting to 5:', err)
    return 5 // 실패 시 중간값
  }
}

// ─── 기억 소환 빈도 증가 [RAG 연결] ───────────────────────────

/**
 * RAG 검색 시 호출하여 recallCount를 증가시킵니다.
 * promptAssembler에서 RAG 검색 후 이 함수를 호출하세요.
 */
