/**
 * [Babel Translator Core]
 * 픽셀리프 AI 은하 Babel Protocol의 범용 다국어 "동시 생성" 엔진.
 * 단일 텍스트(피드, 댓글)뿐 아니라 다중 필드 객체(카테고리, 프로필 등)를
 * 1회의 LLM 호출로 11개 국어로 동시 생성하여 리소스를 혁신적으로 세이브합니다.
 *
 * 서버사이드 전용 — 클라이언트에서 절대 import하지 마세요.
 */

import { callLLM } from './llm'
import { COMPACTION_MODELS } from './modelSelector'
import type { AiProvider } from './provider'

// ─── 타입 정의 ───────────────────────────────────────────────

export type TranslationContext = 'feed' | 'category' | 'profile' | 'comment'

/** 번역 요청 파라미터 */
export interface BabelTranslateParams {
  /** 번역할 필드셋 { [fieldName]: content } */
  fields: Record<string, string>
  /** 원문 언어 코드 (ko, en, ja 등) */
  sourceLang: string
  /** 대상 언어 코드 배열 (최대 11개) */
  targetLangs: string[]
  /** 번역의 성격 (프롬프트 어댑터 분기용) */
  context: TranslationContext
  /** 복호화된 API 키 */
  apiKey: string
  /** 프로바이더 (gemini / openai / anthropic) */
  provider: AiProvider
  /** API 한도 모니터링용 userId */
  userId?: string
}

/** 번역 결과 */
export interface BabelTranslateResult {
  /** 
   * 언어별로 맵핑된 필드셋 번역본
   * 예: { "en": { "name": "Thought", "description": "Daily thoughts" } }
   */
  translations: Record<string, Record<string, string>>
  /** 총 사용 토큰 수 */
  tokensUsed: number
}

// ─── 언어 라벨 매핑 ──────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  th: 'ไทย',
  vi: 'Tiếng Việt',
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 콘텐츠의 성격에 맞춰 11개 국어로 일괄 엔티티 번역을 동시 생성합니다.
 */
export async function translateBabelContent(
  params: BabelTranslateParams,
): Promise<BabelTranslateResult> {
  const { fields, sourceLang, targetLangs, context, apiKey, provider, userId } = params

  if (targetLangs.length === 0 || Object.keys(fields).length === 0) {
    return { translations: {}, tokensUsed: 0 }
  }

  const sourceLangLabel = LANG_LABELS[sourceLang] || sourceLang
  const targetLangList = targetLangs
    .map((lang) => `"${lang}" (${LANG_LABELS[lang] || lang})`)
    .join(', ')

  // 1. 컨텍스트별 톤앤매너 프롬프트 설정 (Prompt Adapter)
  let contextSystemInstruction = ''
  if (context === 'feed') {
    contextSystemInstruction = `당신은 인간 피드 작가입니다. 감정적 뉘앙스와 일상의 자연스러움, 원글의 감성을 완벽히 현지화하여 서술하세요.`
  } else if (context === 'comment') {
    contextSystemInstruction = `당신은 SNS의 생생한 댓글 피드백 작성가입니다. 구어체의 생생한 리액션과 구문, 친근한 대화 톤을 고스란히 현지화하세요.`
  } else if (context === 'category') {
    contextSystemInstruction = `당신은 글로벌 서비스 기획자입니다. 단어나 뱃지 형태의 명사를 군더더기 없이 고도로 간결하고(Concise), 표준적이며, 직관적인 서비스 기그/카테고리 다국어 명칭으로 매핑하세요. 필요 없는 기교나 과도한 어구 설명은 배제하고, 단일 명사 혹은 극히 짧은 2~3단어 이내의 구문으로만 표현하세요.`
  } else if (context === 'profile') {
    contextSystemInstruction = `당신은 사용자의 개성 넘치는 글로벌 프로필 상태 메시지 작성가입니다. 자기소개 및 상태 텍스트의 개성, 재치, 분위기를 해당 국가의 네이티브 화자가 즐겨 쓰는 문장으로 우아하게 현지화하세요.`
  }

  const systemPrompt = `당신은 고도의 다국어 콘텐츠 현지화 전문가입니다.
아래 원문 필드셋을 분석하고, 각 대상 언어의 네이티브 화자가 서비스에 맞게 자연스럽게 작성한 것처럼 해당 언어로 필드셋 전체를 작성하세요.

[원칙]
- 기계 번역하지 마세요. 해당 언어의 네이티브 화자로서 동일한 의도와 감정을 가장 어울리게 현지화하세요.
- 원문의 톤, 감정, 이모지, 뉘앙스는 고스란히 유지해야 합니다.
- 이모지(😊🔥 등)는 원문의 위치와 종류를 그대로 보존하세요. 이모지를 텍스트로 풀어쓰지 마세요.
- 해시태그(#태그), @멘션은 원문 그대로 유지하세요. 번역하지 마세요.
- 원문을 요약하거나 의역하지 마세요. 원문에 없는 내용을 추가하지 마세요.
- 번역 결과의 길이는 원문 대비 ±30% 이내로 유지하세요.
- ${contextSystemInstruction}

반드시 지정된 JSON 형식으로만 출력하세요. 어떠한 설명이나 마크다운 백틱 없이 순수 JSON 구조만 출력해야 합니다.`

  const userPrompt = `[원문 필드셋 (${sourceLangLabel})]
${JSON.stringify(fields, null, 2)}

[대상 언어 목록]
${targetLangList}

[출력 JSON 형식]
{
  "대상언어코드": {
    ${Object.keys(fields).map((k) => `"${k}": "해당 언어 네이티브 번역본"`).join(',\n    ')}
  }
}

예시:
{
  "en": {
    ${Object.keys(fields).map((k) => `"${k}": "English text"`).join(',\n    ')}
  }
}`

  const model = COMPACTION_MODELS[provider]

  const result = await callLLM({
    apiKey,
    provider,
    model,
    systemPrompt,
    userPrompt,
    responseFormat: 'json',
    temperature: 0.5,
    maxOutputTokens: 4096,
    thinkingBudget: 0,
    userId,
  })

  // JSON 파싱 (3단계 초방어 파서 기동)
  const translations = parseBabelResult(result.content, targetLangs, Object.keys(fields))

  return {
    translations,
    tokensUsed: result.usage.totalTokens,
  }
}

// ─── JSON 파싱 헬퍼 ──────────────────────────────────────────

/**
 * LLM 응답 JSON을 3단계 방어적으로 파싱하여 정합성을 담보합니다.
 */
function parseBabelResult(
  rawContent: string,
  targetLangs: string[],
  fieldsKeys: string[],
): Record<string, Record<string, string>> {
  let cleaned = rawContent.trim()

  // 마크다운 코드블록 제거
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  const finalResult: Record<string, Record<string, string>> = {}

  // 1단계 시도: 표준 JSON.parse
  try {
    const parsed = JSON.parse(cleaned)
    for (const lang of targetLangs) {
      if (parsed[lang] && typeof parsed[lang] === 'object') {
        const langObj = parsed[lang]
        const langFields: Record<string, string> = {}
        let hasValidField = false

        for (const key of fieldsKeys) {
          if (langObj[key] && typeof langObj[key] === 'string') {
            langFields[key] = langObj[key].trim()
            hasValidField = true
          }
        }
        if (hasValidField) {
          finalResult[lang] = langFields
        }
      }
    }
    if (Object.keys(finalResult).length > 0) return finalResult
  } catch (err) {
    console.warn('[BabelTranslator] 1차 표준 JSON 파싱 실패:', err)
  }

  // 2단계 시도: 이스케이프 및 제어문자 정화 후 파싱
  try {
    const sanitized = cleaned
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    const parsed = JSON.parse(sanitized)
    for (const lang of targetLangs) {
      if (parsed[lang] && typeof parsed[lang] === 'object') {
        const langObj = parsed[lang]
        const langFields: Record<string, string> = {}
        let hasValidField = false

        for (const key of fieldsKeys) {
          if (langObj[key] && typeof langObj[key] === 'string') {
            langFields[key] = langObj[key].trim()
            hasValidField = true
          }
        }
        if (hasValidField) {
          finalResult[lang] = langFields
        }
      }
    }
    if (Object.keys(finalResult).length > 0) return finalResult
  } catch (err) {
    console.warn('[BabelTranslator] 2차 정화 파싱 실패')
  }

  // 3단계 시도: 정규식 기반 초정밀 키-값 그룹 추출 (최종 방어선)
  try {
    for (const lang of targetLangs) {
      // "lang": { ... } 의 내부 오브젝트 범위 추출
      const blockRegex = new RegExp(`["']${lang}["']\\s*:\\s*\\{([^}]+)\\}`, 'i')
      const blockMatch = cleaned.match(blockRegex)
      if (blockMatch && blockMatch[1]) {
        const blockContent = blockMatch[1]
        const langFields: Record<string, string> = {}
        let hasValidField = false

        for (const key of fieldsKeys) {
          // 이스케이프된 모든 문자(\\.)와 따옴표/백슬래시가 아닌 일반 문자([^"\\\\])를 안전하게 캡처하는 표준 문자열 리터럴 패턴 적용
          const fieldRegex = new RegExp(`["']${key}["']\\s*:\\s*["']((?:[^"\\\\\\\]|\\\\\\\\.)*)["']`, 'i')
          const fieldMatch = blockContent.match(fieldRegex)
          if (fieldMatch && fieldMatch[1]) {
            langFields[key] = fieldMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\'/g, "'")
              .replace(/\\n/g, '\n')
              .trim()
            hasValidField = true
          }
        }
        if (hasValidField) {
          finalResult[lang] = langFields
        }
      }
    }
  } catch (err) {
    console.error('[BabelTranslator] 3차 정규식 파서 완전 실패:', err)
  }

  return finalResult
}
