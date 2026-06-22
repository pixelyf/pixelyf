/**
 * [AI 모델 선택/검증 모듈]
 * 프로바이더별 최소 기준 모델 필터링 + 기본값 설정
 *
 * 29번 아이디어: "2.5-flash 이상" 확정
 * Gemini SDK: @google/generative-ai (이미 설치됨)
 * OpenAI/Anthropic: REST 직접 호출 (SDK 미설치, Phase 1 범위)
 */


import type { AiProvider } from './provider'

/** 프로바이더별 최소 기준 모델 (이 목록에 포함된 모델만 사용 허용) */
const MIN_MODELS: Record<AiProvider, string[]> = {
  gemini: ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'],
  anthropic: ['claude-3-haiku', 'claude-3.5-sonnet', 'claude-sonnet-4'],
}

/** 프로바이더별 기본 모델 */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4',
}

/** 압축 전용 모델 (Reflection 배치 시 비용 절감) */
export const COMPACTION_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku',
}

/** AMGE 파이프라인 전용 모델 (Heartbeat, Drafter, Critic, 상상력 엔진 등) */
export const AMGE_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku',
}

/**
 * 프로바이더별 사용 가능 모델 목록을 조회합니다.
 */
async function fetchAvailableModels(apiKey: string, provider: AiProvider): Promise<string[]> {
  switch (provider) {
    case 'gemini': {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      )
      if (!response.ok) {
        const errBody = await response.text()
        throw new Error(`Gemini API 오류 (${response.status}): ${errBody}`)
      }
      const data = await response.json()
      return (data.models || [])
        .map((m: any) => m.name?.replace('models/', '') || '')
        .filter(Boolean)
    }
    case 'openai': {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (!response.ok) {
        throw new Error(`OpenAI API 오류 (${response.status})`)
      }
      const data = await response.json()
      return (data.data || []).map((m: any) => m.id).filter(Boolean)
    }
    case 'anthropic': {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      })
      if (!response.ok) {
        throw new Error(`Anthropic API 오류 (${response.status})`)
      }
      const data = await response.json()
      return (data.data || []).map((m: any) => m.id).filter(Boolean)
    }
  }
}

/**
 * API 키를 검증하고 사용 가능한 모델 목록 + 기본 모델을 반환합니다.
 */
export async function validateAndSelectModel(
  apiKey: string,
  provider: AiProvider,
  userSelectedModel?: string
): Promise<{ model: string; availableModels: string[] }> {
  const allModels = await fetchAvailableModels(apiKey, provider)

  // 최소 기준 필터링
  const qualified = allModels.filter(m =>
    MIN_MODELS[provider].some(min => m.includes(min))
  )

  if (qualified.length === 0) {
    throw new Error(
      `사용 가능한 모델이 최소 기준에 미달합니다. ` +
      `최소 ${MIN_MODELS[provider].join(', ')} 중 하나가 필요합니다.`
    )
  }

  // 사용자 선택 or 기본값
  const model = userSelectedModel && qualified.some(q => q.includes(userSelectedModel))
    ? userSelectedModel
    : DEFAULT_MODELS[provider]

  return { model, availableModels: qualified }
}
