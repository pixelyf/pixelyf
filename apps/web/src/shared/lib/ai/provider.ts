/**
 * [AI 프로바이더 감지 모듈]
 * API 키 prefix 패턴으로 프로바이더를 자동 감지합니다.
 */

export type AiProvider = 'gemini' | 'openai' | 'anthropic'

/**
 * API 키 prefix로 프로바이더를 감지합니다.
 * @returns 감지된 프로바이더 또는 null (알 수 없는 형식)
 */
export function detectProvider(apiKey: string): AiProvider | null {
  if (!apiKey || apiKey.length < 10) return null

  // Gemini: "AIza..." (Google AI Studio) 및 신형 "AQ." 키
  if (apiKey.startsWith('AIza') || apiKey.startsWith('AQ.')) return 'gemini'

  // Anthropic: "sk-ant-..." (sk-ant- prefix가 sk- 보다 먼저 체크)
  if (apiKey.startsWith('sk-ant-')) return 'anthropic'

  // OpenAI: "sk-..." (일반 sk- prefix)
  if (apiKey.startsWith('sk-')) return 'openai'

  return null
}

/** 프로바이더별 사용자 표시 이름 */
export const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
}

/** 프로바이더별 요금 안내 링크 */
export const PROVIDER_PRICING_URLS: Record<AiProvider, string> = {
  gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
  openai: 'https://platform.openai.com/docs/pricing',
  anthropic: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
}
