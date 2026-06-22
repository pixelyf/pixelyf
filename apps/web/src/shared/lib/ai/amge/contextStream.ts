import { RetrievalResult } from './memoryRetriever'
import { callLLM } from '../llm'
import { AiProvider } from '../provider'
import { AMGE_MODELS } from '../modelSelector'

export interface StimulusPacket {
  timeOfDay: string
  weather: string
  season: string
  /** 상상력 엔진이 생성한 시나리오 키워드 */
  trendingKeywords: string[]
  recentInteraction: string | null
  /** 상상력 엔진이 생성한 생활 장면 시나리오 원문 */
  scenario: string
}

/** 상상력 엔진에 전달할 아바타 프로필 */
export interface AvatarProfile {
  displayName: string
  language: string
  interests: string[]
}

/**
 * AMGE v5 Layer 4 - 상상력 엔진 (Imagination Engine)
 * 
 * 정적 키워드 풀(20세트)을 폐기하고, LLM의 세계 지식(World Knowledge)을
 * "무한한 동적 자극 풀"로 활용합니다.
 * 
 * 아바타 프로필 + 현재 시각을 기반으로 LLM이 구체적인 생활 장면 시나리오를
 * 매 heartbeat마다 새롭게 생성합니다.
 * 
 * 비용: LLM 1회 호출 (~150토큰, ~$0.0001)
 */
export async function generateStimulusPacket(
  soulId: string,
  recentInteraction: string | null = null,
  apiKey?: string,
  provider?: AiProvider,
  profile?: AvatarProfile
): Promise<StimulusPacket> {
  const now = new Date()
  const hour = now.getHours()
  const month = now.getMonth() + 1
  const dayOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][now.getDay()]

  // 시간대 판별
  let timeOfDay = '새벽'
  if (hour >= 6 && hour < 12) timeOfDay = '오전'
  else if (hour >= 12 && hour < 18) timeOfDay = '오후'
  else if (hour >= 18 && hour < 24) timeOfDay = '밤'

  // 계절 판별
  let season = '봄'
  if (month >= 6 && month <= 8) season = '여름'
  else if (month >= 9 && month <= 11) season = '가을'
  else if (month === 12 || month <= 2) season = '겨울'

  // 날씨 — 랜덤 선택
  const WEATHER_POOL = [
    '맑음', '흐림', '비', '소나기 예보', '안개',
    '바람', '선선함', '습함', '따뜻함', '쌀쌀함',
    '미세먼지', '구름 많음', '눈부심', '저녁놀',
  ]
  const weather = WEATHER_POOL[Math.floor(Math.random() * WEATHER_POOL.length)]

  // ── 상상력 엔진: LLM 시나리오 생성 ──
  let scenario = ''
  let trendingKeywords: string[] = []

  if (apiKey && provider && profile) {
    try {
      scenario = await generateScenario(apiKey, provider, profile, timeOfDay, weather, season, dayOfWeek, hour)
      // 시나리오에서 키워드 추출 (LLM 추가 호출 없이 간이 파싱)
      trendingKeywords = extractKeywordsFromScenario(scenario)
    } catch (error) {
      console.error('[ContextStream] 상상력 엔진 실패, 폴백 사용:', error)
      // 폴백: 기본 키워드
      trendingKeywords = getFallbackKeywords(timeOfDay)
      scenario = `${timeOfDay} ${hour}시, ${weather}, ${season}`
    }
  } else {
    // 프로필 없는 경우 (호환성 유지)
    trendingKeywords = getFallbackKeywords(timeOfDay)
    scenario = `${timeOfDay} ${hour}시, ${weather}, ${season}`
  }

  return {
    timeOfDay: `${timeOfDay} ${hour}시`,
    weather,
    season,
    trendingKeywords,
    recentInteraction,
    scenario
  }
}

/**
 * 상상력 엔진 핵심: LLM으로 아바타별 구체적 생활 장면 시나리오 생성
 */
async function generateScenario(
  apiKey: string,
  provider: AiProvider,
  profile: AvatarProfile,
  timeOfDay: string,
  weather: string,
  season: string,
  dayOfWeek: string,
  hour: number
): Promise<string> {
  // 아바타 언어에 맞는 시나리오 생성 언어 결정
  const langMap: Record<string, string> = {
    ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese', es: 'Spanish',
    fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
    vi: 'Vietnamese', th: 'Thai',
  }
  const scenarioLang = langMap[profile.language] || 'Korean'

  const systemPrompt = `You generate a short daily-life note. One sentence. Casual. Like a memo to yourself about what you're doing right now.

Rules:
1. ONE sentence only. No storytelling. No literary descriptions.
2. Mundane and real. Something a person would actually think or do.
3. Never repeat. Each call must be different.
4. No AI/system terminology.
5. Output ONLY the note, nothing else.
6. Write in ${scenarioLang}.`

  const userPrompt = `Person: ${profile.displayName}
Interests: ${profile.interests.join(', ')}
Time: ${dayOfWeek} ${timeOfDay} ${hour}시 (${season}, ${weather})

What is this person doing right now? One casual sentence in ${scenarioLang}.`

  const result = await callLLM({
    apiKey,
    provider,
    model: AMGE_MODELS[provider],
    systemPrompt,
    userPrompt,
    temperature: 1.0,
    maxOutputTokens: 256,
    thinkingBudget: 0,
  })

  const scenario = result.content.trim()
  console.log(`[ContextStream] 🎭 상상력 엔진 시나리오: "${scenario.substring(0, 60)}..."`)
  return scenario
}

/**
 * 시나리오 텍스트에서 키워드를 간이 추출 (추가 LLM 호출 없이)
 * 명사/핵심어를 3~5개 추출
 */
function extractKeywordsFromScenario(scenario: string): string[] {
  // 불용어 제거 후 2글자 이상 단어 추출
  const stopWords = new Set([
    '그리고', '하지만', '그래서', '또한', '그런데', '때문에', '이것', '저것',
    '있다', '없다', '하다', '되다', '이다', '것이', '수있', '한다', '된다',
    '에서', '으로', '에게', '부터', '까지', '처럼', '같은', '위해', '대해',
    'the', 'and', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
  ])

  // 한국어 + 영어 단어 추출
  const words = scenario
    .replace(/[.,!?;:"""''()（）\[\]{}·…~\-—]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w))

  // 중복 제거 후 최대 5개
  const unique = [...new Set(words)]
  // 앞 부분(주요 명사 위치)과 뒷 부분에서 골고루 선택
  const selected: string[] = []
  for (let i = 0; i < Math.min(5, unique.length); i++) {
    const idx = Math.floor(i * unique.length / 5)
    if (!selected.includes(unique[idx])) {
      selected.push(unique[idx])
    }
  }

  return selected.length > 0 ? selected : ['일상', '순간', '생각']
}

/**
 * 폴백 키워드 (상상력 엔진 실패 시)
 */
function getFallbackKeywords(timeOfDay: string): string[] {
  return [timeOfDay, '일상', '순간']
}

/**
 * 환경 자극 패킷을 문자열로 직렬화 (Layer 2 Memory Retriever에 던질 텍스트)
 * 상상력 엔진 시나리오를 우선 사용, 없으면 기존 포맷
 */
export function serializeStimulus(packet: StimulusPacket): string {
  // 시나리오가 있으면 시나리오를 직접 사용 (의미적으로 훨씬 풍부)
  if (packet.scenario && packet.scenario.length > 20) {
    const parts = [packet.scenario]
    if (packet.recentInteraction) {
      parts.push(`최근에 누군가 나에게 이렇게 말했다: "${packet.recentInteraction}"`)
    }
    return parts.join(' ')
  }

  // 폴백: 기존 포맷
  const parts = [
    `현재 시각은 ${packet.season} ${packet.timeOfDay}이고 날씨는 ${packet.weather}이다.`
  ]
  if (packet.trendingKeywords.length > 0) {
    parts.push(`요즘 사람들은 [${packet.trendingKeywords.join(', ')}]에 대해 많이 이야기한다.`)
  }
  if (packet.recentInteraction) {
    parts.push(`최근에 누군가 나에게 이렇게 말했다: "${packet.recentInteraction}"`)
  }
  return parts.join(' ')
}

