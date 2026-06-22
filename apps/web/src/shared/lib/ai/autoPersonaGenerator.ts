/**
 * [v4 Auto Persona Generator]
 * UserPersona 10축 점수를 기반으로 직업, 관심사, 초기 Thread를 자동 생성합니다.
 * 새 유저 가입 시 시드 스크립트 없이 자동으로 페르소나를 구성합니다.
 *
 * 학술 근거: Persona Hub (Chan et al. 2024) — 데이터 기반 대규모 페르소나 생성
 *
 * 설계 출처: docs/2_AI_은하_설계/3_뉴런_알고리즘_설계서_v3_v4.md Part C
 */

// ─── 타입 ────────────────────────────────────────────────────

export interface GeneratedPersona {
  occupation: string
  interestTags: string[]
  initialThreads: Array<{ title: string; category: string; type: string; desire: string }>
}

export interface PersonalityScores {
  score_e_i: number       // Extraversion-Introversion (0=I, 100=E)
  score_s_n: number       // Sensing-iNtuition (0=S, 100=N)
  score_t_f: number       // Thinking-Feeling (0=T, 100=F)
  score_j_p: number       // Judging-Perceiving (0=J, 100=P)
  score_morning_night: number  // (0=아침형, 100=저녁형)
  score_home_open: number      // (0=집돌이, 100=밖돌이)
  score_spend_save: number     // (0=절약, 100=소비)
  score_depth_broad: number    // (0=넓게, 100=깊게)
  score_calm_vibrant: number   // (0=차분, 100=활발)
  score_yolo_future: number    // (0=미래지향, 100=YOLO)
}

// ─── 상수: 성격 클러스터 → 직업 매핑 ────────────────────────

interface OccupationRule {
  occupation: string
  conditions: Array<{ axis: keyof PersonalityScores; operator: '>' | '<'; threshold: number }>
  baseInterests: string[]
}

const OCCUPATION_RULES: OccupationRule[] = [
  {
    occupation: '개발자/엔지니어',
    conditions: [
      { axis: 'score_depth_broad', operator: '>', threshold: 55 },
      { axis: 'score_calm_vibrant', operator: '<', threshold: 50 },
    ],
    baseInterests: ['프로그래밍', '기술 트렌드'],
  },
  {
    occupation: '디자이너/크리에이터',
    conditions: [
      { axis: 'score_s_n', operator: '>', threshold: 55 },
      { axis: 'score_t_f', operator: '>', threshold: 55 },
    ],
    baseInterests: ['디자인', '시각 예술'],
  },
  {
    occupation: '마케터/기획자',
    conditions: [
      { axis: 'score_e_i', operator: '>', threshold: 55 },
      { axis: 'score_yolo_future', operator: '>', threshold: 50 },
    ],
    baseInterests: ['마케팅', '브랜드 전략'],
  },
  {
    occupation: '교육자/연구원',
    conditions: [
      { axis: 'score_depth_broad', operator: '>', threshold: 60 },
      { axis: 'score_s_n', operator: '>', threshold: 50 },
    ],
    baseInterests: ['교육', '학문 연구'],
  },
  {
    occupation: '콘텐츠 크리에이터',
    conditions: [
      { axis: 'score_e_i', operator: '>', threshold: 55 },
      { axis: 'score_calm_vibrant', operator: '>', threshold: 55 },
    ],
    baseInterests: ['콘텐츠 제작', 'SNS'],
  },
  {
    occupation: '프리랜서/자영업자',
    conditions: [
      { axis: 'score_j_p', operator: '>', threshold: 55 },
      { axis: 'score_yolo_future', operator: '>', threshold: 55 },
    ],
    baseInterests: ['자기 경영', '네트워킹'],
  },
]

/** 성격 기반 보조 관심사 풀 */
const PERSONALITY_INTEREST_POOL: Array<{ condition: (s: PersonalityScores) => boolean; tags: string[] }> = [
  { condition: s => s.score_calm_vibrant > 60, tags: ['여행', '스포츠', '아웃도어'] },
  { condition: s => s.score_calm_vibrant < 40, tags: ['독서', '명상', '글쓰기'] },
  { condition: s => s.score_home_open < 40, tags: ['요리', '게임', '영화 감상'] },
  { condition: s => s.score_home_open > 60, tags: ['카페 탐방', '전시회', '공연'] },
  { condition: s => s.score_t_f > 60, tags: ['심리학', '인간관계', '감성 에세이'] },
  { condition: s => s.score_t_f < 40, tags: ['과학', '경제', '데이터 분석'] },
  { condition: s => s.score_morning_night < 40, tags: ['아침 루틴', '조깅', '건강 관리'] },
  { condition: s => s.score_morning_night > 60, tags: ['야경 사진', '밤 산책', '클럽/바'] },
]

/** 카테고리별 Thread 제목 풀 */
const THREAD_TEMPLATES: Record<string, Array<{ title: string; desire: string }>> = {
  CAREER: [
    { title: '나만의 전문성 쌓기', desire: '분야에서 인정받는 사람이 되기' },
    { title: '업무 효율 높이기', desire: '스마트하게 일하기' },
  ],
  HEALTH: [
    { title: '건강한 루틴 만들기', desire: '꾸준한 운동 습관' },
    { title: '식습관 개선', desire: '건강한 몸 만들기' },
  ],
  HOBBY: [
    { title: '취미 시작하기', desire: '새로운 즐거움 발견' },
    { title: '좋아하는 것 깊이 파기', desire: '취미의 전문가 되기' },
  ],
  SOCIAL: [
    { title: '새로운 사람들과 만남', desire: '인맥 넓히기' },
    { title: '소중한 관계 유지하기', desire: '깊은 우정 쌓기' },
  ],
  STUDY: [
    { title: '새로운 분야 탐험', desire: '지적 호기심 충족' },
    { title: '자격증 도전', desire: '실력 인증' },
  ],
  REFLECTION: [
    { title: '나를 돌아보는 시간', desire: '자아 성찰' },
    { title: '가치관 정리', desire: '삶의 방향 설정' },
  ],
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 10축 성격 점수를 기반으로 직업, 관심사, 초기 Thread를 자동 생성합니다.
 *
 * @param scores 10축 성격 점수
 * @returns 생성된 페르소나
 */
export function generatePersonaFromScores(
  scores: PersonalityScores,
): GeneratedPersona {
  // 1. 직업 매핑
  const occupation = matchOccupation(scores)

  // 2. 관심사 생성 (직업 기본 2개 + 성격 기반 1~2개)
  const interestTags = generateInterestTags(scores, occupation)

  // 3. 초기 Thread 생성 (CAREER 1개 + 랜덤 2개)
  const initialThreads = generateInitialThreads()

  return { occupation, interestTags, initialThreads }
}

// ─── 내부 함수 ───────────────────────────────────────────────

function matchOccupation(scores: PersonalityScores): string {
  // 조건 매칭 점수가 가장 높은 직업 선택
  let bestOccupation = '사무직/회사원' // 기본값
  let bestScore = 0

  for (const rule of OCCUPATION_RULES) {
    let matchScore = 0
    let allMatch = true

    for (const cond of rule.conditions) {
      const value = scores[cond.axis]
      if (cond.operator === '>' && value > cond.threshold) {
        matchScore += (value - cond.threshold) / 10
      } else if (cond.operator === '<' && value < cond.threshold) {
        matchScore += (cond.threshold - value) / 10
      } else {
        allMatch = false
      }
    }

    if (allMatch && matchScore > bestScore) {
      bestScore = matchScore
      bestOccupation = rule.occupation
    }
  }

  return bestOccupation
}

function generateInterestTags(scores: PersonalityScores, occupation: string): string[] {
  const tags: string[] = []

  // 직업 기본 태그 (2개)
  const rule = OCCUPATION_RULES.find(r => r.occupation === occupation)
  if (rule) {
    tags.push(...rule.baseInterests)
  }

  // 성격 기반 태그 (1~2개)
  const personalityTags: string[] = []
  for (const pool of PERSONALITY_INTEREST_POOL) {
    if (pool.condition(scores)) {
      personalityTags.push(...pool.tags)
    }
  }

  // 랜덤으로 1~2개 선택
  const shuffled = personalityTags.sort(() => Math.random() - 0.5)
  const additional = shuffled.slice(0, Math.min(2, shuffled.length))
  tags.push(...additional)

  // 중복 제거 + 최대 5개
  return [...new Set(tags)].slice(0, 5)
}

function generateInitialThreads(): GeneratedPersona['initialThreads'] {
  const threads: GeneratedPersona['initialThreads'] = []

  // CAREER 1개 (필수)
  const careerOptions = THREAD_TEMPLATES.CAREER
  const career = careerOptions[Math.floor(Math.random() * careerOptions.length)]
  threads.push({ title: career.title, category: 'CAREER', type: 'PROJECT', desire: career.desire })

  // 랜덤 카테고리 2개 (CAREER 제외)
  const otherCategories = Object.keys(THREAD_TEMPLATES).filter(c => c !== 'CAREER')
  const shuffled = otherCategories.sort(() => Math.random() - 0.5).slice(0, 2)

  for (const cat of shuffled) {
    const options = THREAD_TEMPLATES[cat]
    const pick = options[Math.floor(Math.random() * options.length)]
    threads.push({ title: pick.title, category: cat, type: 'PROJECT', desire: pick.desire })
  }

  return threads
}
