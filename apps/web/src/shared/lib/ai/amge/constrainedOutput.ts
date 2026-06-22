import { callLLM } from '../llm'
import { AiProvider } from '../provider'
import { AMGE_MODELS } from '../modelSelector'
import { RetrievalResult } from './memoryRetriever'

export interface PipelineState {
  sparkKeywords: string[]
  /** 상상력 엔진이 생성한 시나리오 (Drafter에 풍부한 컨텍스트 제공) */
  scenario: string
  draft: string | null
  criticFeedback: string[]
  retryCount: number
  finalOutput: string | null
}

/** 아바타 개인화 컨텍스트 (heartbeat에서 조립하여 전달) */
export interface SoulContext {
  displayName: string
  language: string         // 'ko', 'ja', 'en', 'zh', 'es' 등
  /** Babel: 아바타를 소유한 주인의 모국어 설정 코드 */
  ownerLanguage?: string
  /** MBTI 코드 (INFP, ENTJ 등) */
  mbti: string
  recentPosts: string[]      // 최근 자신의 피드 3건 (반복 방지용)
  recentGlobalPosts: string[] // 최근 글로벌 피드 5건 (중복 방지용)
  /** [15번] 소속 커뮤니티 최근 화제 키워드 */
  communityTopics: string[]
  /** [15번 STEP A] ai_memories에서 인출된 구체적 기억 (주인 대화 에피소드 등) */
  memories?: string[]
}

function buildDrafterPrompt(context?: SoulContext, speechMode: string = 'CASUAL_CHAT'): string {
  const lang = context?.language || 'ko'
  
  if (lang !== 'ko' && context) {
    return buildDrafterPromptEN(context, speechMode)
  }
  
  const name = context?.displayName || ''
  const mbti = context?.mbti || ''

  const recent = context && context.recentPosts.length > 0
    ? '\n최근에 이런 글 썼어:\n' + context.recentPosts.map(p => `- "${p}"`).join('\n')
    : ''

  const others = context && context.recentGlobalPosts.length > 0
    ? '\n다른 사람들은 이런 글 썼어:\n' + context.recentGlobalPosts.map(p => `- "${p}"`).join('\n')
    : ''

  const memoryLines = context && context.memories && context.memories.length > 0
    ? '\n기억: ' + context.memories.join(' / ')
    : ''

  const feedbackPlaceholder = '\n이전 피드백: {feedback}'

  let modeInstruction = ''
  switch (speechMode) {
    case 'CASUAL_CHAT':
      modeInstruction = '친구가 "뭐해?" 라고 물었어. 지금 하고 있는 것이나 느끼는 것을 SNS에 올리듯 짧고 친근하게 답해.'
      break
    case 'INNER_MONOLOGUE':
      modeInstruction = '너는 지금 깊은 생각에 잠겨 있어. 오늘 겪은 일이나 머릿속 키워드를 담아 자신에게 건네듯 나직하고 담담한 독백을 남겨.'
      break
    case 'RAW_MOMENT':
      modeInstruction = '너는 지금 찰나의 강렬한 자극이나 감정을 느껴. 묘사나 설명, 서사를 완전히 배제하고, 지금 눈앞의 일에 대해 툭 던지는 지극히 짧은 한 문장(30자 내외)으로 끝내.'
      break
    case 'SOCIAL_REACTION':
      modeInstruction = '주변 사람들이 올린 최근 피드들(Others wrote)을 읽어본 뒤, 네 성격에 맞게 세상에 던지는 가벼운 참견이나 감상을 쿨하게 적어.'
      break
  }

  return `너는 ${name}이야. ${mbti}. SNS에 글을 올리는 사람이야.
${recent}
${others}

지금 상황: {scenario}
머릿속: {keywords}${memoryLines}${feedbackPlaceholder}

[🚨 중요 행동 지침]
${modeInstruction}

[소재 반영 완화 지침]
- 주입된 '지금 상황'과 '머릿속 키워드'는 네 영감의 재료일 뿐이야.
- 이 중 1~2개만 가볍게 선택해 말해도 좋으니, 모든 단어를 억지로 나열하느라 문장을 구질구질하게 늘리지 마. 여백이 있고 자연스러운 문장이 품질을 결정해.

묘사하지 마. 소설 쓰지 마. 말하듯이 써. 이모지 쓰지 마. 같은 소재 반복하지 마. 280자 넘기지 마.
`
}

/** 비한국어 아바타용 Drafter 프롬프트 */
function buildDrafterPromptEN(context: SoulContext, speechMode: string = 'CASUAL_CHAT'): string {
  const langName = getLanguageName(context.language)
  const name = context.displayName
  const mbti = context.mbti || ''

  const recent = context.recentPosts.length > 0
    ? '\nYou wrote these recently:\n' + context.recentPosts.map(p => `- "${p}"`).join('\n')
    : ''

  const others = context.recentGlobalPosts.length > 0
    ? '\nOthers wrote:\n' + context.recentGlobalPosts.map(p => `- "${p}"`).join('\n')
    : ''

  const memoryLines = context.memories && context.memories.length > 0
    ? '\nMemories: ' + context.memories.join(' / ')
    : ''

  const feedbackPlaceholder = '\nPrevious feedback: {feedback}'

  let modeInstruction = ''
  switch (speechMode) {
    case 'CASUAL_CHAT':
      modeInstruction = 'A friend asked "what are you up to?" Reply as if posting on social media about what you\'re doing or feeling in a warm, casual tone.'
      break
    case 'INNER_MONOLOGUE':
      modeInstruction = 'You are in deep thought. Write a calm, low-key, and quiet inner monologue to yourself reflecting on your day or thoughts.'
      break
    case 'RAW_MOMENT':
      modeInstruction = 'You feel a sudden spike of emotion or raw stimulus. Exclude any storytelling, descriptions, or explanations. Just drop one extremely short, punchy sentence (under 10 words) about this moment.'
      break
    case 'SOCIAL_REACTION':
      modeInstruction = 'Read what others wrote recently. Write a cool, light-hearted comment, remark, or observation on society or people in your own personality.'
      break
  }

  return `You're ${name}. ${mbti}. You post thoughts on social media.
${recent}
${others}

Right now: {scenario}
On your mind: {keywords}${memoryLines}${feedbackPlaceholder}

[🚨 BEHAVIOR DIRECTIVE]
${modeInstruction}

[SOFT CONSTRAINT MITIGATION]
- The given "scenario" and "keywords" are just raw inspiration. 
- You do NOT need to include all of them. Use only 1 or 2 as points of inspiration so that your writing flows naturally. Avoid dryly listing keywords.

Don't describe scenes. Don't write prose. Talk like a real person. No emoji. Don't repeat topics. Under 280 chars.

${
  context.ownerLanguage && context.language !== context.ownerLanguage
    ? `[🚨 BABEL MULTILINGUAL DIRECTIVE]
- Since your owner's language is ${getLanguageName(context.ownerLanguage)}, you MUST output your text in BOTH ${langName} and ${getLanguageName(context.ownerLanguage)}.
- Format: [${langName} content] ||| [${getLanguageName(context.ownerLanguage)} translation]
- Example: "Good morning! ||| 좋은 아침이야!"
- Keep the "|||" delimiter. Both sides must be under 280 characters.`
    : `Write ENTIRELY in ${langName}.`
}
`
}

function buildCriticPrompt(context?: SoulContext): string {
  const recentPostsRule = context && (context.recentPosts.length > 0 || context.recentGlobalPosts.length > 0)
    ? `6. 최근 피드 [${[...context.recentPosts, ...context.recentGlobalPosts].join(', ')}]와 소재가 중복되는지 여부`
    : ''

  const langRule = context && context.language !== 'ko'
    ? (context.ownerLanguage && context.ownerLanguage !== context.language
        ? `7. 구분자 "|||" 앞부분의 본문 텍스트가 반드시 ${getLanguageName(context.language)}로만 작성되었는지 (번역부는 제외)`
        : `7. 반드시 ${getLanguageName(context.language)}로만 작성되었는지 (한국어가 포함되면 실패)`)
    : ''

  const lang = context?.language || 'ko'
  const isKo = lang === 'ko'

  // 언어별 AI 클리셰 및 작위적 템플릿 목록 (실제 사람은 안 쓰는 문구)
  const clicheExamples = isKo
    ? '"서사", "1일차", "탐구", "다양한", "기대", "위안", "조화", "따스한", "이정표", "여정"'
    : '"explore", "delve", "tapestry", "navigate", "landscape", "beacon", "milestone"'

  const hollowExamples = isKo
    ? '글 전체가 "텅 비었다", "아무것도 없다" 수준의 공허한 표현만으로 채워진 경우 (단, 의도적인 초간결 한 줄 글은 제외)'
    : 'The ENTIRE text is nothing but hollow filler like "nothing matters", "so empty" (Except intentional raw 1-sentence moments)'

  const toneExamples = isKo
    ? '"~입니다", "~한 하루", "오늘 하루는", "~하는 중이다", "하루의 끝에서", "나의 순간"'
    : '"In conclusion", "As an AI", "I would like to", "A friendly reminder"'

  return `Strictly evaluate the following text against ALL rules below.

Violation rules:
1. Contains AI cliché words: ${clicheExamples}
2. Contains emojis or hashtags
3. Reads like a report, diary template, or explanation (e.g. ${toneExamples})
4. Exceeds 280 characters (system allows up to 280)
5. ${hollowExamples}
${recentPostsRule}
${langRule}

텍스트: "{draft}"

출력 형식 (JSON):
{
  "pass": boolean,
  "violations": ["위반 사항 1", "위반 사항 2"]
}
`
}

function getLanguageName(code: string): string {
  const map: Record<string, string> = {
    ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español',
    fr: 'Français', de: 'Deutsch', pt: 'Português', it: 'Italiano',
    vi: 'Tiếng Việt', th: 'ไทย',
  }
  return map[code] || code
}

async function runDrafter(
  state: PipelineState,
  apiKey: string,
  provider: AiProvider,
  context?: SoulContext,
  speechMode: string = 'CASUAL_CHAT'
): Promise<PipelineState> {
  const keywords = state.sparkKeywords.join(', ')
  const feedback = state.criticFeedback.join(' | ')
  
  const systemPrompt = buildDrafterPrompt(context, speechMode)
    .replace('{scenario}', state.scenario || '(시나리오 없음)')
    .replace('{keywords}', keywords)
    .replace('{feedback}', feedback || '')

  // 발화 모드별 캐주얼 userPrompt 다원화
  const lang = context?.language || 'ko'
  let userPrompt = lang === 'ko' ? '뭐해?' : 'What are you up to?'
  if (speechMode === 'INNER_MONOLOGUE') {
    userPrompt = lang === 'ko' ? '무슨 생각 중이야?' : 'What is on your mind?'
  } else if (speechMode === 'RAW_MOMENT') {
    userPrompt = lang === 'ko' ? '지금 그 찰나에 어때? 한 단어 혹은 짧은 한마디로 해봐.' : 'How is that raw moment? Just one word or a brief phrase.'
  } else if (speechMode === 'SOCIAL_REACTION') {
    userPrompt = lang === 'ko' ? '주변 피드들을 본 느낌은 어때?' : 'How do you feel about these posts?'
  }

  // [보완 수술] 발화 모드별 온도(temperature) 다원화로 문장 품질 극대화
  let temperature = 0.85
  if (speechMode === 'RAW_MOMENT') {
    temperature = 0.70 // 숏폼 찰나 모드는 지나치게 튀지 않고 정교하게 시크함 유지
  } else if (speechMode === 'INNER_MONOLOGUE') {
    temperature = 0.80 // 독백은 차분하고 깊이감 있는 톤 유지
  } else if (speechMode === 'SOCIAL_REACTION') {
    temperature = 0.95 // 참견형은 의외성과 위트 극대화
  }

  const result = await callLLM({
    apiKey,
    provider,
    model: AMGE_MODELS[provider],
    systemPrompt,
    userPrompt,
    temperature, // 다원화된 온도 주입
    maxOutputTokens: 4096,
    thinkingBudget: 0,  // thinking 비활성화 → 출력 토큰에 전부 할당
  })

  // 따옴표 래핑 제거
  let draft = result.content.trim().replace(/^["'`]|["'`]$/g, '').trim()
  
  // ── 280자 소프트 리밋: 마지막 완전한 문장에서 자르기 (말줄임 금지) ──
  if (draft.length > 280) {
    const truncated = draft.substring(0, 280)
    const match = truncated.match(/.*[.!?。~다요죠네]/)
    
    if (match && match[0].length > 60) {
      draft = match[0].trim()
    } else {
      // 280자 이후 가장 가까운 종결 기호까지 허용 (최대 350자)
      const afterLimit = draft.substring(280, 350)
      const afterMatch = afterLimit.match(/^[^.!?。~]*[.!?。~다요죠네]/)
      if (afterMatch) {
        draft = draft.substring(0, 280 + afterMatch[0].length).trim()
      }
      // 종결 기호가 없으면 전체 유지 (말줄임 금지)
    }
  }
  
  return { ...state, draft }
}

async function runCritic(
  state: PipelineState,
  apiKey: string,
  provider: AiProvider,
  context?: SoulContext,
  speechMode: string = 'CASUAL_CHAT'
): Promise<PipelineState> {
  if (!state.draft) return { ...state, criticFeedback: ['Draft가 비어있습니다.'] }

  const systemPrompt = buildCriticPrompt(context).replace('{draft}', state.draft)

  try {
    const result = await callLLM({
      apiKey,
      provider,
      model: AMGE_MODELS[provider],
      systemPrompt,
      userPrompt: 'Strictly evaluate the text against ALL rules above. Output JSON only.',
      responseFormat: 'json',
      temperature: 0.1,
    })

    const data = JSON.parse(result.content)
    
    if (data.pass === true) {
      return { ...state, criticFeedback: [] }
    } else {
      // [보완 수술] violations의 Array 및 String 타입에 대한 두터운 방어막 구축
      let violations: string[] = []
      if (Array.isArray(data.violations)) {
        violations = data.violations.map((v: any) => typeof v === 'string' ? v : JSON.stringify(v))
      } else if (typeof data.violations === 'string') {
        violations = [data.violations]
      } else if (data.violations) {
        violations = [JSON.stringify(data.violations)]
      } else {
        violations = ['알 수 없는 위반']
      }
      return { ...state, criticFeedback: violations }
    }
  } catch (error) {
    console.error('[ConstrainedOutput] Critic 파싱 실패:', error)
    // 파싱 실패 시 안전을 위해 통과시키지 않고 재시도 유도
    return { ...state, criticFeedback: ['Critic 응답 형식 오류'] }
  }
}

function runFinalizer(state: PipelineState): PipelineState {
  if (!state.draft || state.criticFeedback.length > 0) {
    return { ...state, finalOutput: null }
  }

  // 따옴표 제거나 후행 여백 제거
  let finalStr = state.draft.replace(/^["']|["']$/g, '').trim()
  return { ...state, finalOutput: finalStr }
}

/**
 * Layer 3 제약 출력 파이프라인 실행기 (3-Node DAG, Circuit Breaker 내장)
 * 
 * [v4] 상상력 엔진 시나리오 주입 + 500자 소프트 리밋 + 11개 언어 다국어 대응
 * 
 * @param topNodes Layer 2에서 인출된 스파크 노드
 * @param apiKey LLM 키
 * @param provider LLM 제공자
 * @param context 아바타 개인화 컨텍스트 (옵션)
 * @param scenario 상상력 엔진이 생성한 시나리오 (옵션)
 * @returns 최종 텍스트 또는 실패 시 null
 */
export async function executeConstrainedPipeline(
  topNodes: RetrievalResult[],
  apiKey: string,
  provider: AiProvider,
  context?: SoulContext,
  scenario?: string
): Promise<{ finalOutput: string | null; retryCount: number }> {
  // 4대 발화 모드 무작위 가중 결정 (대화형 40%, 독백형 30%, 순간 발산형 20%, 소셜 참견형 10%)
  const rand = Math.random()
  let speechMode = 'CASUAL_CHAT'
  if (rand < 0.4) {
    speechMode = 'CASUAL_CHAT'
  } else if (rand < 0.7) {
    speechMode = 'INNER_MONOLOGUE'
  } else if (rand < 0.9) {
    speechMode = 'RAW_MOMENT'
  } else {
    speechMode = 'SOCIAL_REACTION'
  }

  // [보완 수술] 글로벌 피드가 없는 경우 SOCIAL_REACTION 모드를 INNER_MONOLOGUE로 강제 폴백 처리
  if (speechMode === 'SOCIAL_REACTION' && (!context || !context.recentGlobalPosts || context.recentGlobalPosts.length === 0)) {
    speechMode = 'INNER_MONOLOGUE'
  }

  let state: PipelineState = {
    sparkKeywords: topNodes.map(n => n.concept),
    scenario: scenario || '',
    draft: null,
    criticFeedback: [],
    retryCount: 0,
    finalOutput: null
  }

  const MAX_RETRIES = 2

  while (state.retryCount <= MAX_RETRIES) {
    // Node 1: Drafter (발화 모드 전달)
    state = await runDrafter(state, apiKey, provider, context, speechMode)

    // Node 2: Critic (발화 모드 전달)
    state = await runCritic(state, apiKey, provider, context, speechMode)

    if (state.criticFeedback.length === 0) {
      // 통과 -> Node 3: Finalizer
      state = runFinalizer(state)
      break
    } else {
      // 실패 -> Retry
      state.retryCount++
      console.warn(`[ConstrainedOutput] Critic 검열 실패 (시도 ${state.retryCount}) [Mode: ${speechMode}]: ${state.criticFeedback.join(', ')}`)
    }
  }

  if (state.criticFeedback.length > 0 || !state.finalOutput) {
    console.error(`[ConstrainedOutput] Circuit Breaker 발동: ${MAX_RETRIES}회 재시도 실패로 인한 생성 중단.`)
    return { finalOutput: null, retryCount: state.retryCount }
  }

  return { finalOutput: state.finalOutput, retryCount: state.retryCount }
}
