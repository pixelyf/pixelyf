/**
 * [문화 다리 AI 엔진]
 * 컨텐츠의 문화적 맥락을 자동 감지하고 글로벌 유저를 위한 문화적 설명 및 번역 레이어를 생성합니다.
 * 서버사이드 전용.
 */

import { callLLM } from './llm'
import { resolveApiKeyByUserId } from './compaction'
import { COMPACTION_MODELS } from './modelSelector'

export interface CulturalContext {
  koreanTerms: { term: string; explanation: string }[]
  emotionalSubtext: string          // 한국 감성 코드 해설
  globalParallel: string            // 유사한 글로벌 개념 제시
  sensitivityWarnings: string[]     // 문화 충돌 예방 경고
}

/**
 * 모먼트 콘텐츠의 문화적 배경과 맥락을 분석하여 설명 레이어를 반환합니다.
 */
export async function analyzeCulturalContext(
  content: string,
  authorCulture: 'KR' | 'GLOBAL',
  targetAudience: 'KR' | 'GLOBAL' | 'BOTH',
  userId: string
): Promise<CulturalContext> {
  const fallback: CulturalContext = {
    koreanTerms: [],
    emotionalSubtext: '',
    globalParallel: '',
    sensitivityWarnings: []
  }

  if (!content || !content.trim()) {
    return fallback
  }

  try {
    // 1. 사용자 API 키 조회
    const { apiKey, provider } = await resolveApiKeyByUserId(userId)
    const model = COMPACTION_MODELS[provider]

    // 2. 프롬프트 정의
    const systemPrompt = `당신은 한국 문화와 정서를 전 세계에 가교하는 문화 번역가이자 글로벌 인류학자입니다.
주어진 게시물(컨텐츠)의 정서적, 언어적, 문화적 맥락을 분석하여 다음 JSON 형식으로만 반환해 주세요.

[분석 요구사항]
1. koreanTerms: 게시물에 등장하는 독특한 한국적 용어(예: 야근, 밥상, 혼밥, 눈치, 정, 썸, 불금, 치맥 등)를 찾아내어 영어로 직관적인 설명(explanation)을 덧붙이세요.
2. emotionalSubtext: 한국의 삶의 맥락에서 이 글의 작성자가 느끼는 보이지 않는 감정적 뉘앙스(예: 직장인의 피로감과 작은 행복, 집단주의적 압박 속에서의 고독 등)를 영어로 해설하세요.
3. globalParallel: 서구권 등 글로벌 유저들이 쉽게 공감할 수 있는 유사한 정서적/문화적 개념(예: 혼밥 -> Solo dining culture, 눈치 -> High-context social intelligence)을 제시하세요.
4. sensitivityWarnings: 한-글로벌 문화 차이로 인해 오해가 생길 수 있는 지점(예: 서구권 관점에서의 지나치게 사적인 언급이나 뉘앙스)을 짚어주고, 오해를 방지하기 위해 글로벌 독자가 알아야 할 설명/주의점(warnings)을 제안하세요.

출력은 반드시 마크다운 백틱 없이 유효한 JSON 형식으로만 출력해야 합니다.`

    const userPrompt = `[작성자 문화군] ${authorCulture}
[타겟 문화군] ${targetAudience}
[컨텐츠 내용]
"${content}"

위 컨텐츠를 분석한 결과를 아래의 JSON 형태로 출력하세요.

{
  "koreanTerms": [
    { "term": "용어", "explanation": "영어 설명" }
  ],
  "emotionalSubtext": "영어 정서적 맥락 설명",
  "globalParallel": "영어 유사 개념 설명",
  "sensitivityWarnings": [
    "경고/오해방지 가이드라인 문구"
  ]
}`

    // 3. LLM 호출
    const result = await callLLM({
      apiKey,
      provider,
      model,
      systemPrompt,
      userPrompt,
      responseFormat: 'json',
      temperature: 0.3,
      maxOutputTokens: 1500,
      thinkingBudget: 0,
      userId
    })

    // 4. 파싱 및 응답
    let cleaned = result.content.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    }

    const parsed = JSON.parse(cleaned)
    return {
      koreanTerms: Array.isArray(parsed.koreanTerms) ? parsed.koreanTerms : [],
      emotionalSubtext: typeof parsed.emotionalSubtext === 'string' ? parsed.emotionalSubtext : '',
      globalParallel: typeof parsed.globalParallel === 'string' ? parsed.globalParallel : '',
      sensitivityWarnings: Array.isArray(parsed.sensitivityWarnings) ? parsed.sensitivityWarnings : []
    }

  } catch (error) {
    console.error('[CulturalBridgeEngine] 문화 분석 중 오류 발생 (Non-critical):', error)
    return fallback
  }
}
