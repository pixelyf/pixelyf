/**
 * [마이크로 시나리오 생성기]
 * Thread + Phase + PAD → 1줄 시나리오 문장 생성.
 * LLM에 전달할 '상황 한 줄' 프롬프트를 만듭니다.
 *
 * 포스팅의 60%는 Thread 기반, 30%는 Daily Noise, 10%는 Life Event(발생 시).
 *
 * 설계 출처: docs/2_AI_은하_설계/12_뉴런_알고리즘_설계서_v1.md §5
 * v2 확장: Daily Template 시간 블록 연동 + 댓글 4유형 (설계서 v2 §3, §5)
 */

import { getPhaseLabel, getPhaseEmotion, type PADState } from './padEmotionEngine'

// ─── 타입 ────────────────────────────────────────────────────

export interface ScenarioInput {
  threadTitle: string
  threadCategory: string
  threadDesire?: string
  currentPhase: number
  threadType: 'PROJECT' | 'LIFE_EVENT'
  pad: PADState
  dayCount?: number
  lastEventSummary?: string
  occupation?: string
  /** v2: 현재 시간 블록 활동명 */
  currentActivity?: string
  /** v2: 누적 에너지 라벨 */
  energyLabel?: string
  /** v2: Appraisal 내러티브 힌트 */
  narrativeHint?: string
  /** v2: 블록별 Daily Noise */
  blockNoise?: string | null
  /** v3: 커뮤니티 자극 컨텍스트 (Smart Event triggers) */
  socialContext?: string
  /** v3: 교류 대상 선택 이유 (BOND/INTEREST/TRENDING/RANDOM) */
  targetRelation?: string
}

export interface ScenarioOutput {
  scenario: string
  postType: 'THREAD' | 'DAILY_NOISE' | 'LIFE_EVENT'
  maxLength: number
}

// ─── 상수: 직업별 Daily Noise 템플릿 ────────────────────────

const DAILY_NOISE_TEMPLATES: Record<string, string[]> = {
  '개발자/엔지니어': [
    '모니터 앞에서 멍하니 커서가 깜빡이는 걸 보고 있다',
    '커피를 내리며 오늘 뭘 만들지 생각하는 중',
    '점심 뭐 먹을지가 오늘의 가장 어려운 문제',
    '이어폰 끼고 코딩하다 보니 해가 졌다',
    '깃 커밋 메시지를 5분째 고민 중',
  ],
  '학생': [
    '강의실에 10분 일찍 왔는데 아무도 없다',
    '도서관 자리 뺏김. 오늘 운이 없다',
    '학식이 의외로 맛있는 날',
    '과제 마감이 3시간 남았는데 아직 0%',
    '카페에서 공부하는 척하며 멍때리는 중',
  ],
  '교육자': [
    '아이들이 하교한 뒤 교실의 고요함',
    '수업 준비 3시간, 실제 수업 40분의 삶',
    '급식 맛있는 날은 교실이 조용하다',
    '분필 가루가 옷에 또 묻었다',
    '학부모 면담 후의 피로감',
  ],
  '사업가/창업가': [
    '공유오피스 커피가 또 떨어졌다',
    '팀원들이 퇴근 안 하는 게 미안하다',
    '라면이 주식이 된 지 일주일째',
    'IR 덱을 또 수정하는 밤',
    '투자자 미팅 취소 문자',
  ],
  '자영업자': [
    '비 오는 날 손님이 줄어드는 법칙',
    '재고 정리하다 보니 저녁이다',
    '단골이 오면 하루가 괜찮아진다',
    '에스프레소 머신 또 고장',
    '매출 장부 보면서 한숨',
  ],
  '사무직/회사원': [
    '결재 서류 12건이 밀려있다',
    '구내식당 메뉴 확인이 아침 첫 루틴',
    '회의가 회의를 낳는 하루',
    '칼퇴 성공한 날의 기쁨',
    '엘리베이터 기다리며 하늘 보기',
  ],
  '프리랜서/1인기업': [
    '작업 중 고양이가 키보드 위에 올라왔다',
    '카페에서 자리 찾는 것도 일이다',
    '마감과 자유 사이의 줄타기',
    '인보이스 보내고 답장 기다리는 중',
    '재택의 적은 냉장고',
  ],
  '의료/상담/복지': [
    '상담실 향초를 교체해야 한다',
    '점심 혼밥은 충전 시간',
    '타인의 마음을 돌보다 내 마음을 잊는 날',
    '퇴근길 음악이 위로가 되는 날',
    '오늘 하루도 잘 버텼다',
  ],
  // 기본 (매핑 안 되는 직업)
  'default': [
    '오늘 하늘이 유독 예쁘다',
    '커피 한 잔의 여유',
    '점심 뭘 먹을지 고민 중',
    '퇴근길 노을이 좋다',
    '오랜만에 산책',
  ],
}

/** Daily Noise 비율 (30% — 설계서 §5.4) */
const DAILY_NOISE_RATIO = 0.30
/** Thread 기반 60%, Life Event 10% (발생 시에만) */

// ─── 랜덤 변수 테이블 (설계서 §5.3) ─────────────────

const WEATHER_TABLE = [
  { value: '맑은 날', weight: 60 },
  { value: '흐린 날', weight: 25 },
  { value: '비 오는 날', weight: 10 },
  { value: '눈 오는 날', weight: 3 },
  { value: '폭염/한파', weight: 2 },
]

const CONDITION_TABLE = [
  { value: '컬디션 좋음', weight: 50 },
  { value: '보통', weight: 35 },
  { value: '피곤함', weight: 10 },
  { value: '몸이 안 좋음', weight: 5 },
]

const INCIDENT_TABLE = [
  { value: '', weight: 70 }, // 평범한 날 (비어있음)
  { value: '작은 발견이 있었다', weight: 15 },
  { value: '작은 실수를 했다', weight: 8 },
  { value: '좋은 소식이 있었다', weight: 5 },
  { value: '나쁜 소식이 있었다', weight: 2 },
]

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 포스팅 시나리오를 생성합니다.
 * 60% Thread 기반 시나리오, 30% Daily Noise (설계서 §5.4).
 */
export function generateScenario(
  input: ScenarioInput,
  random?: number,
): ScenarioOutput {
  const r = random ?? Math.random()

  // 30% 확률로 Daily Noise (Life Event가 아닌 경우에만)
  if (r < DAILY_NOISE_RATIO && input.threadType !== 'LIFE_EVENT') {
    // v2: 블록별 noisePool 우선 사용
    if (input.blockNoise) {
      return { scenario: input.blockNoise, postType: 'DAILY_NOISE', maxLength: 50 }
    }
    return generateDailyNoise(input.occupation)
  }

  // Thread 기반 시나리오
  return generateThreadScenario(input)
}

/**
 * Thread 기반 시나리오를 생성합니다.
 */
function generateThreadScenario(input: ScenarioInput): ScenarioOutput {
  const phaseLabel = getPhaseLabel(input.currentPhase, input.threadType)
  const emotion = getPhaseEmotion(input.currentPhase, input.threadType)

  const parts: string[] = []

  // 설계서 §5.2: dayCount + 시간대 포함
  const timeSlot = getTimeSlot(new Date().getHours())
  parts.push(`"${input.threadTitle}" ${input.dayCount ?? 1}일차 ${timeSlot}.`)

  // v2: 시간 블록 활동 연동
  if (input.currentActivity) {
    parts.push(`방금 ${input.currentActivity} 마침.`)
  }
  if (input.energyLabel && input.energyLabel !== '보통') {
    parts.push(`상태: ${input.energyLabel}.`)
  }

  // 랜덤 변수 (설계서 §5.3)
  const weather = pickWeighted(WEATHER_TABLE)
  const condition = pickWeighted(CONDITION_TABLE)
  const incident = pickWeighted(INCIDENT_TABLE)
  if (weather) parts.push(`날씨: ${weather}.`)
  if (condition !== '보통') parts.push(`컬디션: ${condition}.`)
  if (incident) parts.push(`${incident}.`)

  // v2: Appraisal 내러티브 힌트
  if (input.narrativeHint) {
    parts.push(input.narrativeHint)
  }

  // 맥락 연결: 이전 포스트가 있으면 참조
  if (input.lastEventSummary) {
    parts.push(`어제: "${input.lastEventSummary}".`)
  }

  if (input.threadDesire) {
    parts.push(`목표: ${input.threadDesire}.`)
  }

  // PAD 기반 감정 힌트
  if (input.pad.A > 0.3) {
    parts.push('감정이 격앙되어 있다.')
  } else if (input.pad.A < -0.3) {
    parts.push('무기력하고 조용한 상태다.')
  }
  if (input.pad.P < -0.3) {
    parts.push('기분이 좋지 않다.')
  }

  // 길이 제한: Arousal 높으면 150자, 기본 80자
  const maxLength = input.pad.A > 0.7 ? 150 : 80

  const postType = input.threadType === 'LIFE_EVENT' ? 'LIFE_EVENT' as const : 'THREAD' as const

  return {
    scenario: parts.join(' '),
    postType,
    maxLength,
  }
}

/**
 * Daily Noise를 생성합니다.
 */
function generateDailyNoise(occupation?: string): ScenarioOutput {
  const templates = DAILY_NOISE_TEMPLATES[occupation ?? ''] || DAILY_NOISE_TEMPLATES['default']
  const idx = Math.floor(Math.random() * templates.length)

  return {
    scenario: templates[idx],
    postType: 'DAILY_NOISE',
    maxLength: 50,
  }
}

/**
 * 댓글 시나리오를 생성합니다 (타인의 포스트에 대한 반응).
 * v2: xF/xT/Ex/Ix 4유형 복원 (설계서 §5.5)
 *
 * @param targetContent 대상 포스트 내용
 * @param myPad 나의 현재 PAD 상태
 * @param personalityEI E/I 점수 (0~100)
 * @param personalityTF T/F 점수 (0~100)
 */
export function generateCommentScenario(
  targetContent: string,
  myPad: PADState,
  personalityEI?: number,
  personalityTF?: number,
  /** v3: 사회적 컨텍스트 (예: "친한 아바타의 글", "관심사 겹침") */
  socialContext?: string,
): string {
  const ei = personalityEI ?? 50
  const tf = personalityTF ?? 50
  const introvert = ei < 40
  const feeling = tf > 60

  // v2: 4유형 세분화
  let reactionTypes: string[]
  if (introvert && feeling) {
    // IF: 조용한 감성 공감
    reactionTypes = ['조용한 감성 공감', '짧은 위로 한 마디']
  } else if (introvert && !feeling) {
    // IT: 논리적 관찰
    reactionTypes = ['논리적 관찰 한 줄', '조용한 경험 공유']
  } else if (!introvert && feeling) {
    // EF: 에너지 넘치는 공감
    reactionTypes = ['에너지 넘치는 공감', '질문으로 대화 확장']
  } else {
    // ET: 직설적 응원
    reactionTypes = ['직설적 응원', '핵심 지적 한 마디']
  }

  const reactionType = reactionTypes[Math.floor(Math.random() * reactionTypes.length)]

  const parts: string[] = []
  parts.push(`다음 글에 ${reactionType}으로 반응하세요.`)
  parts.push(`글: "${targetContent.slice(0, 80)}"`)

  // v3: 사회적 맥락 주입
  if (socialContext) {
    parts.push(`[맥락] ${socialContext}`)
  }

  if (myPad.P < -0.3) {
    parts.push('당신은 지금 기분이 좋지 않다. 그래도 반응한다.')
  }

  return parts.join(' ')
}

// ─── 유틸리티 ────────────────────────────────────────────

/** 가중치 기반 랜덤 선택 */
function pickWeighted(table: Array<{ value: string; weight: number }>): string {
  const totalWeight = table.reduce((sum, item) => sum + item.weight, 0)
  let r = Math.random() * totalWeight
  for (const item of table) {
    r -= item.weight
    if (r <= 0) return item.value
  }
  return table[0].value
}

/** 시간대 문자열 */
function getTimeSlot(hour: number): string {
  if (hour >= 5 && hour < 9) return '아침'
  if (hour >= 9 && hour < 12) return '오전'
  if (hour >= 12 && hour < 14) return '점심'
  if (hour >= 14 && hour < 18) return '오후'
  if (hour >= 18 && hour < 22) return '저녁'
  return '새벽'
}
