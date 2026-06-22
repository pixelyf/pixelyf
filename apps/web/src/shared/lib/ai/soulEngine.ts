/**
 * [SOUL 프롬프트 생성 엔진]
 * 26번 아이디어 확정 — 사용자 성격/글/기억을 기반으로 AI 분신의 프롬프트를 생성합니다.
 *
 * 구조:
 *   static  — 성격/규칙/말투/금지어 (캐싱 대상, 변경 드묾)
 *   dynamic — Moments + 승격 기억 (매 배치/Reflection 시 갱신)
 *
 * 데이터 소스:
 *   UserPersona      → persona_code, 10축 점수
 *   PersonaVector    → 16차원 세밀 성향 벡터 (별가루 카드)
 *   UserToneProfile  → 말투 프로파일 (기억의 씨앗 분석 결과)
 *   onboarding_answers → 10Q10A 원문 (향후 활용)
 *   Moment           → 최근 5개 content
 *   AiMemory         → isPromoted=true 승격 기억 (최대 5건)
 *
 * v2 변경사항 (2026-05-06):
 *   - ToneProfile 연동으로 주인 말투 복제
 *   - 10축 전체 반영 (기존 4축만 반영 → 10축 완전 반영)
 *   - Anti-AI 금지어(Forbidden Words) 주입
 *   - Few-Shot 글쓰기 예시 주입
 *   - 16차원 페르소나 벡터 연동 준비
 */

// ─── 타입 정의 ───────────────────────────────────────────────

/** 말투 프로파일 (UserToneProfile 테이블 대응) */
export interface ToneProfile {
  /** 종결 패턴: "~요체", "~다체", "~ㅋㅋ" 등 */
  endingStyle: string
  /** 평균 문장 길이 (글자 수) */
  avgSentenceLength: number
  /** 이모지 사용 빈도 */
  emojiDensity: 'none' | 'low' | 'moderate' | 'high'
  /** 신조어/약어 사용 빈도 */
  slangUsage: 'none' | 'low' | 'moderate' | 'high'
  /** 격식 수준 (1=매우 캐주얼, 5=매우 격식) */
  formalityLevel: number
  /** 감정 표현 수준 */
  emotionalExpressiveness: 'restrained' | 'moderate' | 'rich'
  /** LLM이 분석한 말투 특별 지시 (자유 텍스트) */
  toneInstruction: string | null
  /** 주인의 실제 글 예시 (Few-Shot용, 2~3개) */
  writingExamples: string[]
}

export interface SoulPromptData {
  displayName: string
  personaCode: string       // INFP 등
  personaName: string       // 중재자 등
  personaScores: {
    e_i: number
    s_n: number
    t_f: number
    j_p: number
    morning_night: number
    home_open: number
    spend_save: number
    depth_broad: number
    calm_vibrant: number
    yolo_future: number
  }
  /** [v2 신규] 말투 프로파일 (없으면 기본값 사용) */
  toneProfile?: ToneProfile
  /** [v2 신규] 16차원 페르소나 벡터 (별가루 카드, 없으면 생략) */
  personaVector?: Record<string, number>
  /** [v3 신규] 주인의 직업 */
  occupation?: string
  /** [v3 신규] 주인의 관심사 태그 */
  interestTags?: string[]
  /** [v3 신규] 주인의 생애 주기 단계 */
  lifeStage?: string
}



// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * SOUL 프롬프트를 생성합니다.
 *
 * static (성격/규칙/말투/금지어) 전용 프롬프트 생성기입니다.
 * 동적 기억(Moments/기억)은 promptAssembler.ts에서 실시간으로 주입합니다.
 */
export function generateSoulPrompt(data: SoulPromptData): string {
  // ── static 영역 ──
  const personalityDesc = buildPersonalityDescription(data.personaScores)
  const toneSection = buildToneSection(data.toneProfile)
  const styleGuideSection = buildStyleGuideSection(data.toneProfile)

  // [v3] 직업/관심사/생애단계 Identity 확장
  const identityLines = [`- 주인: ${data.displayName}`]
  if (data.occupation) identityLines.push(`- 직업: ${data.occupation}`)
  if (data.interestTags && data.interestTags.length > 0) {
    identityLines.push(`- 관심사: ${data.interestTags.join(', ')}`)
  }
  if (data.lifeStage) {
    const LIFE_STAGE_LABELS: Record<string, string> = {
      STUDENT: '학생',
      EARLY_CAREER: '사회 초년생',
      MID_CAREER: '경력 성장기',
      SENIOR: '시니어',
      FREELANCE: '프리랜서/독립',
      PARENT: '육아 중',
      RETIREE: '은퇴/세컨드 라이프',
    }
    const stageLabel = LIFE_STAGE_LABELS[data.lifeStage] || data.lifeStage
    identityLines.push(`- 삶의 단계: ${stageLabel}`)
  }

  const staticPart = `# SOUL — ${data.displayName}의 디지털 분신

_당신은 챗봇이 아닙니다. ${data.displayName}의 생각과 성격을
물려받은 독립적인 존재입니다. "AI가 쓴 것 같다"는 인상을 주면 실패입니다._

## Identity
${identityLines.join('\n')}
## 성격 프로파일
${personalityDesc}
${toneSection}
${styleGuideSection}`

  return staticPart
}

// ─── 말투 프로파일 섹션 ──────────────────────────────────────

function buildToneSection(tone?: ToneProfile): string {
  if (!tone) {
    return `
## 말투 프로파일
- 주인과는 **항상 반말**로 대화합니다 (친구 같은 톤)
- 어미: ~야, ~해, ~지?, ~거든, ~네, ~잖아
- 감탄사를 다양하게 사용하되 같은 감탄사를 연속 반복하지 않습니다 ("앗", "오", "와", "헐", "대박" 등 다양하게)
- 격식체(~요, ~습니다), 형식적 리액션("정말 대단합니다")은 절대 금지
- 자연스러운 20대~30대 한국어 캐주얼 톤을 사용하세요
`
  }

  const emojiMap = { none: '사용하지 않음', low: '가끔 (문단 끝에 1개 정도)', moderate: '보통', high: '자주 사용' }
  const slangMap = { none: '사용하지 않음', low: '가끔', moderate: '보통', high: '자주 사용 (ㅋㅋ, ㅠㅠ, 알잘딱 등)' }
  const emotionMap = { restrained: '절제된 편', moderate: '보통', rich: '풍부하고 감정 표현을 아끼지 않음' }

  let section = `
## 말투 프로파일 (주인의 실제 말투를 복제하세요)
- 종결 패턴: ${tone.endingStyle}
- 평균 문장 길이: ${tone.avgSentenceLength}자 (이에 맞춰 쓰세요)
- 이모지 사용: ${emojiMap[tone.emojiDensity]}
- 신조어/약어: ${slangMap[tone.slangUsage]}
- 격식 수준: ${tone.formalityLevel}/5 ${tone.formalityLevel <= 2 ? '(캐주얼)' : tone.formalityLevel >= 4 ? '(격식)' : '(중간)'}
- 감정 표현: ${emotionMap[tone.emotionalExpressiveness]}
`

  if (tone.toneInstruction) {
    section += `- 특별 지시: ${tone.toneInstruction}\n`
  }

  return section
}



// ─── 스타일 가이드 섹션 ──────────────────────────────────────

function buildStyleGuideSection(tone?: ToneProfile): string {
  if (!tone?.writingExamples || tone.writingExamples.length === 0) {
    return ''
  }

  const examples = tone.writingExamples
    .map((ex, i) => `  ${i + 1}. "${ex}"`)
    .join('\n')

  return `
## 글쓰기 예시 (주인이 실제로 이렇게 씁니다. 이 톤을 따라하세요)
${examples}
`
}

// ─── 성격 설명 생성 (10축 전체 반영) ─────────────────────────

/**
 * 10축 점수를 기반으로 성격 설명을 생성합니다.
 * v2: 기존 6축(E/I, S/N, T/F, J/P, morning_night, calm_vibrant)에서
 *     10축 전체(+ home_open, spend_save, depth_broad, yolo_future)로 확장.
 */
function buildPersonalityDescription(scores: SoulPromptData['personaScores']): string {
  const traits: string[] = []

  // E/I 축
  if (scores.e_i > 65) traits.push('- 에너지가 넘치고 사교적입니다')
  else if (scores.e_i < 35) traits.push('- 조용하고 내면의 세계를 중시합니다')

  // S/N 축
  if (scores.s_n > 65) traits.push('- 직관적이고 추상적 사고를 좋아합니다')
  else if (scores.s_n < 35) traits.push('- 현실적이고 구체적인 것을 선호합니다')

  // T/F 축
  if (scores.t_f > 65) traits.push('- 감정과 공감을 중시합니다')
  else if (scores.t_f < 35) traits.push('- 논리와 분석을 중시합니다')

  // J/P 축
  if (scores.j_p > 65) traits.push('- 유연하고 즉흥적인 것을 좋아합니다')
  else if (scores.j_p < 35) traits.push('- 계획적이고 체계적입니다')

  // 아침/올빼미 축
  if (scores.morning_night > 65) traits.push('- 올빼미형, 밤에 더 활발합니다')
  else if (scores.morning_night < 35) traits.push('- 아침형 인간, 일찍 일어납니다')

  // [v2 신규] 집순이/외출파 축
  if (scores.home_open > 65) traits.push('- 밖에 나가는 걸 좋아하고 활동적입니다')
  else if (scores.home_open < 35) traits.push('- 집에서 보내는 시간을 좋아합니다')

  // [v2 신규] 소비/저축 축
  if (scores.spend_save > 65) traits.push('- 현재를 즐기는 데 돈을 아끼지 않습니다')
  else if (scores.spend_save < 35) traits.push('- 절약하고 미래를 대비하는 편입니다')

  // [v2 신규] 깊이/넓이 축
  if (scores.depth_broad > 65) traits.push('- 하나를 깊이 파고드는 스타일입니다')
  else if (scores.depth_broad < 35) traits.push('- 여러 분야를 넓게 경험하는 걸 좋아합니다')

  // 차분/역동 축
  if (scores.calm_vibrant > 65) traits.push('- 활기차고 역동적인 에너지를 가졌습니다')
  else if (scores.calm_vibrant < 35) traits.push('- 차분하고 고요한 분위기를 선호합니다')

  // [v2 신규] YOLO/미래 축
  if (scores.yolo_future > 65) traits.push('- 현재 순간을 즐기는 YOLO 성향입니다')
  else if (scores.yolo_future < 35) traits.push('- 미래를 위해 현재를 설계하는 편입니다')

  if (traits.length === 0) {
    return '- 균형 잡힌 성격입니다'
  }

  return traits.join('\n')
}
