/**
 * [AI LLM 통합 호출 모듈]
 * Gemini / OpenAI / Anthropic 프로바이더를 통합하여 단일 인터페이스로 LLM을 호출합니다.
 * 서버사이드 전용 — 클라이언트에서 절대 import하지 마세요.
 *
 * 사용처:
 * - Phase 4: Heartbeat 오케스트레이터 (행동 결정 JSON)
 * - Phase 4: Reflection 배치 (압축 요약 text)
 *
 * 의존:
 * - provider.ts: AiProvider 타입
 * - errorHandler.ts: handleKeyInvalid (401 자동 비활성화)
 *
 * SDK:
 * - Gemini: @google/generative-ai (설치됨)
 * - OpenAI: REST 직접 호출 (SDK 미설치)
 * - Anthropic: REST 직접 호출 (SDK 미설치)
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { AiProvider } from './provider.ts'
import { handleKeyInvalid } from './errorHandler.ts'

// ─── 타입 정의 ───────────────────────────────────────────────

/** callLLM 입력 파라미터 */
export interface CallLLMParams {
  /** 복호화된 평문 API 키 */
  apiKey: string
  /** 프로바이더 (gemini / openai / anthropic) */
  provider: AiProvider
  /** 사용할 모델명 */
  model: string
  /** 시스템 프롬프트 (SOUL + 메모리 조립 결과) */
  systemPrompt: string
  /** 사용자 프롬프트 (Heartbeat: 현재 상황 + 행동 결정 요청) */
  userPrompt: string
  /** 응답 형식: json = Heartbeat 행동 결정, text = Reflection 요약 */
  responseFormat?: 'json' | 'text'
  /** Gemini thinking budget (기본 1024) */
  thinkingBudget?: number
  /** 생성 온도 (기본 0.8 — 자연스러운 SNS 톤) */
  temperature?: number
  /** 최대 출력 토큰 (기본 2048) */
  maxOutputTokens?: number
  /** 401 에러 시 자동 비활성화할 userId (선택) */
  userId?: string
}

/** callLLM 출력 결과 */
export interface CallLLMResult {
  /** LLM 응답 본문 */
  content: string
  /** 토큰 사용량 */
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

// ─── 상수 ────────────────────────────────────────────────────

/** API 호출 타임아웃 (30초) */
const FETCH_TIMEOUT_MS = 30_000

/** Gemini 안전 설정 — 모든 카테고리 BLOCK_NONE (SNS 콘텐츠 자유도 보장, 모더레이션은 별도 처리) */
const GEMINI_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
]

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 프로바이더 통합 LLM 호출
 *
 * @example
 * ```ts
 * const result = await callLLM({
 *   apiKey: decryptedKey,
 *   provider: 'gemini',
 *   model: 'gemini-2.5-pro',
 *   systemPrompt: soulPrompt,
 *   userPrompt: '현재 상황을 보고 행동을 결정하세요.',
 *   responseFormat: 'json',
 * })
 * const action = JSON.parse(result.content)
 * ```
 */
export async function callLLM(params: CallLLMParams): Promise<CallLLMResult> {
  const {
    apiKey,
    provider,
    model,
    systemPrompt,
    userPrompt,
    responseFormat = 'text',
    thinkingBudget = 1024,
    temperature = 0.8,
    maxOutputTokens = 2048,
    userId,
  } = params

  try {
    switch (provider) {
      case 'gemini':
        return await callGemini(apiKey, model, systemPrompt, userPrompt, responseFormat, thinkingBudget, temperature, maxOutputTokens)
      case 'openai':
        return await callOpenAI(apiKey, model, systemPrompt, userPrompt, responseFormat, temperature, maxOutputTokens)
      case 'anthropic':
        return await callAnthropic(apiKey, model, systemPrompt, userPrompt, temperature, maxOutputTokens)
      default:
        throw new Error(`지원하지 않는 프로바이더: ${provider}`)
    }
  } catch (error: any) {
    // 401 자동 비활성화
    if (error?.status === 401 && userId) {
      await handleKeyInvalid(userId, provider)
    }
    throw error
  }
}

// ─── Gemini (SDK 사용) ───────────────────────────────────────

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  responseFormat: 'json' | 'text',
  thinkingBudget: number,
  temperature: number,
  maxOutputTokens: number,
): Promise<CallLLMResult> {
  const genAI = new GoogleGenerativeAI(apiKey)

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens,
  }

  // thinkingConfig는 항상 명시적으로 설정 (생략 시 Gemini 기본 thinking이 활성화되어 출력 토큰 소모)
  generationConfig.thinkingConfig = { thinkingBudget }

  // JSON 모드
  if (responseFormat === 'json') {
    generationConfig.responseMimeType = 'application/json'
  }

  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig,
    safetySettings: GEMINI_SAFETY_SETTINGS,
  })

  const result = await genModel.generateContent(userPrompt)
  const response = result.response
  const text = response.text()

  // 디버그: 응답 분석 로그
  const candidate = response.candidates?.[0]
  const finishReason = candidate?.finishReason ?? 'UNKNOWN'
  const partCount = candidate?.content?.parts?.length ?? 0
  console.log(`[LLM:Gemini] model=${model}, finishReason=${finishReason}, parts=${partCount}, textLen=${text.length}, maxTokens=${maxOutputTokens}, thinkingBudget=${thinkingBudget}`)

  const meta = response.usageMetadata
  return {
    content: text,
    usage: {
      inputTokens: meta?.promptTokenCount ?? 0,
      outputTokens: meta?.candidatesTokenCount ?? 0,
      totalTokens: meta?.totalTokenCount ?? 0,
    },
  }
}

// ─── OpenAI (REST 직접 호출) ─────────────────────────────────

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  responseFormat: 'json' | 'text',
  temperature: number,
  maxOutputTokens: number,
): Promise<CallLLMResult> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxOutputTokens,
  }

  // JSON 모드 (gpt-4o 이상 지원)
  if (responseFormat === 'json') {
    body.response_format = { type: 'json_object' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      const error = new Error(`OpenAI API 오류 (${response.status}): ${errText}`) as any
      error.status = response.status
      throw error
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    const usage = data.usage ?? {}

    return {
      content,
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Anthropic (REST 직접 호출) ──────────────────────────────

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxOutputTokens: number,
): Promise<CallLLMResult> {
  // Anthropic은 system을 messages 배열 밖에 별도 필드로 분리해야 함
  const body = {
    model,
    max_tokens: maxOutputTokens,
    temperature,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      const error = new Error(`Anthropic API 오류 (${response.status}): ${errText}`) as any
      error.status = response.status
      throw error
    }

    const data = await response.json()
    // Anthropic 응답: content[0].text
    const content = data.content?.[0]?.text ?? ''
    const usage = data.usage ?? {}

    return {
      content,
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ─── 임베딩 (Vector RAG 용) ──────────────────────────────────

/**
 * AI 기억 장기기억 RAG 전용 임베딩 (1536차원)
 * 프로바이더별 분기:
 * - Gemini: gemini-embedding-001 (Matryoshka 1536차원)
 * - OpenAI: text-embedding-3-small (네이티브 1536차원)
 * - Anthropic: 미지원 → null
 *
 * ⚠️ AMGE 지식그래프용 768차원 임베딩은 amge/embedding.ts의 generateEmbedding을 사용하세요.
 */
export async function callEmbedding(
  apiKey: string,
  provider: AiProvider,
  text: string,
): Promise<number[] | null> {
  if (!apiKey) return null

  try {
    switch (provider) {
      case 'gemini':
        return await callGeminiEmbedding(apiKey, text)
      case 'openai':
        return await callOpenAIEmbedding(apiKey, text)
      default:
        console.warn(`[Embedding] ${provider} 프로바이더는 임베딩을 지원하지 않습니다.`)
        return null
    }
  } catch (error) {
    console.error(`[Embedding Error] ${provider} 임베딩 생성 실패:`, error)
    return null
  }
}

/**
 * Gemini 임베딩: gemini-embedding-001 (Matryoshka, 1536차원)
 * AMGE embedding.ts의 768차원 패턴과 동일하되, outputDimensionality만 1536으로 변경
 */
async function callGeminiEmbedding(apiKey: string, text: string): Promise<number[] | null> {
  const geminiKey = process.env.FREE_GEMINI_EMBEDDING_KEY || apiKey
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 1536,
      }),
    }
  )

  if (!response.ok) {
    console.error(`[Embedding:Gemini] 응답 실패 (${response.status}):`, await response.text().catch(() => ''))
    return null
  }

  const data = await response.json()
  return data.embedding?.values ?? null
}

/**
 * OpenAI 임베딩: text-embedding-3-small (네이티브 1536차원)
 */
async function callOpenAIEmbedding(apiKey: string, text: string): Promise<number[] | null> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!response.ok) {
    console.error(`[Embedding:OpenAI] 응답 실패 (${response.status}):`, await response.text().catch(() => ''))
    return null
  }

  const data = await response.json()
  return data.data?.[0]?.embedding ?? null
}

