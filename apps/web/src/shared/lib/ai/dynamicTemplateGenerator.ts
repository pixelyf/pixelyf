/**
 * [v4 Dynamic Template Generator]
 * ATUS 데이터 기반으로 직업별 시간 블록 템플릿을 동적 생성합니다.
 * v2의 dailyTemplateData.ts (15개 고정 템플릿)의 확장 계층.
 *
 * 분기 변수:
 *   - 직업명 (occupation)
 *   - 성격 점수 (morning_night, calm_vibrant)
 *   - 요일 (평일/주말)
 *   - 월 (시즌 판별)
 *
 * 설계 출처: docs/2_AI_은하_설계/3_뉴런_알고리즘_설계서_v3_v4.md Part C
 */

// ─── 타입 ────────────────────────────────────────────────────

export interface TimeBlock {
  startHour: number
  endHour: number
  activity: string
  energyCost: number // -1 ~ +1 (음수=충전, 양수=소모)
  noisePool?: string[] // Daily Noise용 짧은 상황 문장들
}

export interface GeneratedTemplate {
  blocks: TimeBlock[]
  variant: string
  generatedFrom: 'ATUS_PATTERN' | 'OCCUPATION_RULE' | 'CUSTOM'
}

// ─── 상수: 직업별 ATUS 패턴 ──────────────────────────────────

/** 직업군별 근무 시간대 패턴 (ATUS 데이터 기반 근사) */
const OCCUPATION_PATTERNS: Record<string, {
  workStart: number; workEnd: number; commute: number
  noises: string[]
}> = {
  '사무직/회사원': {
    workStart: 9, workEnd: 18, commute: 1,
    noises: ['회의 끝나고 커피', '점심 뭐 먹지', '퇴근길 노래 듣기'],
  },
  '개발자/엔지니어': {
    workStart: 10, workEnd: 19, commute: 0.5,
    noises: ['모니터 앞 멍때림', '커피 내리는 중', '코드 리뷰 중'],
  },
  '디자이너/크리에이터': {
    workStart: 10, workEnd: 19, commute: 0.5,
    noises: ['영감 검색 중', '포트폴리오 정리', '색감 실험'],
  },
  '교육자/연구원': {
    workStart: 8, workEnd: 17, commute: 1,
    noises: ['수업 준비', '논문 읽는 중', '학생 상담'],
  },
  '의료/보건': {
    workStart: 7, workEnd: 16, commute: 0.5,
    noises: ['교대 준비', '잠깐 쉬는 시간', '기록 정리'],
  },
  '서비스직/판매': {
    workStart: 10, workEnd: 20, commute: 0.5,
    noises: ['오픈 준비', '점심 교대', '퇴근 카운트다운'],
  },
  '프리랜서/자영업자': {
    workStart: 11, workEnd: 20, commute: 0,
    noises: ['홈카페 모드', '클라이언트 메일', '자유로운 오후'],
  },
  '콘텐츠 크리에이터': {
    workStart: 11, workEnd: 22, commute: 0,
    noises: ['편집 작업 중', '촬영 준비', '댓글 확인'],
  },
  '대학생/대학원생': {
    workStart: 9, workEnd: 17, commute: 0.5,
    noises: ['강의실 이동 중', '도서관 자리잡기', '과제 마감 임박'],
  },
  '마케터/기획자': {
    workStart: 9, workEnd: 18, commute: 1,
    noises: ['트렌드 리서치', '보고서 작성', '브레인스토밍'],
  },
  '은퇴자': {
    workStart: -1, workEnd: -1, commute: 0,
    noises: ['산책 나가기', '뉴스 읽기', '텃밭 가꾸기'],
  },
}

/** 시즌별 보정 */
const SEASON_ACTIVITIES: Record<string, string[]> = {
  spring: ['벚꽃 구경', '봄 햇살 아래 산책'],
  summer: ['에어컨 앞에서 아이스 아메리카노', '늦은 밤 산책'],
  autumn: ['단풍 사진', '따뜻한 차 한 잔'],
  winter: ['따뜻한 이불 속', '핫초코 타기'],
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 직업명 + 성격 점수 + 컨텍스트로 일일 시간 블록을 자동 생성합니다.
 *
 * @param occupation 직업명
 * @param personalityScores 성격 점수 (morning_night, calm_vibrant)
 * @param context 요일/월 컨텍스트
 * @returns 생성된 템플릿
 */
export function generateDailyTemplate(
  occupation: string,
  personalityScores: { morning_night: number; calm_vibrant: number },
  context: { dayOfWeek: number; month: number },
): GeneratedTemplate {
  const pattern = OCCUPATION_PATTERNS[occupation] || OCCUPATION_PATTERNS['사무직/회사원']
  const isWeekend = context.dayOfWeek === 0 || context.dayOfWeek === 6
  const season = getSeason(context.month)

  // 성격 보정: morning_night (0=극 아침형, 100=극 저녁형)
  const morningBias = personalityScores.morning_night < 40 ? -1 : personalityScores.morning_night > 60 ? 1 : 0

  // 수면 시간 계산 (6.5~8h, 성격 보정)
  const sleepHours = 7 + (personalityScores.calm_vibrant < 40 ? 0.5 : personalityScores.calm_vibrant > 60 ? -0.5 : 0)
  const wakeHour = Math.floor(isWeekend ? 9 + morningBias : Math.max(5, (pattern.workStart - pattern.commute - 1) + morningBias))
  const sleepHour = Math.min(24, Math.floor(wakeHour + (24 - sleepHours)))

  const blocks: TimeBlock[] = []

  // 1. 수면 (0시 ~ 기상)
  blocks.push({
    startHour: 0,
    endHour: wakeHour,
    activity: '수면',
    energyCost: -0.8,
  })

  // 2. 아침 루틴
  blocks.push({
    startHour: wakeHour,
    endHour: wakeHour + 1,
    activity: '아침 루틴',
    energyCost: -0.2,
    noisePool: ['커피 한 잔', '아침 스트레칭', '뉴스 확인'],
  })

  if (isWeekend || pattern.workStart === -1) {
    // 주말/무직: 자유 시간
    const seasonActivities = SEASON_ACTIVITIES[season] || []
    blocks.push({
      startHour: wakeHour + 1,
      endHour: 12,
      activity: '자유 활동',
      energyCost: 0.1,
      noisePool: ['느긋한 오전', ...seasonActivities],
    })
    blocks.push({
      startHour: 12,
      endHour: 13,
      activity: '점심',
      energyCost: -0.3,
      noisePool: ['브런치 모드', '맛집 탐방'],
    })
    blocks.push({
      startHour: 13,
      endHour: 18,
      activity: '취미/외출',
      energyCost: 0.3,
      noisePool: ['카페에서 독서', '운동', '친구 만남', ...pattern.noises.slice(0, 1)],
    })
  } else {
    // 평일: 출퇴근 + 근무
    if (pattern.commute > 0) {
      blocks.push({
        startHour: wakeHour + 1,
        endHour: pattern.workStart,
        activity: '출근',
        energyCost: 0.3,
        noisePool: ['이어폰 끼고 출근', '지하철 사람 많다'],
      })
    }

    // 오전 근무
    blocks.push({
      startHour: pattern.workStart,
      endHour: 12,
      activity: '오전 근무',
      energyCost: 0.4,
      noisePool: pattern.noises.slice(0, 2),
    })

    // 점심
    blocks.push({
      startHour: 12,
      endHour: 13,
      activity: '점심시간',
      energyCost: -0.3,
      noisePool: ['점심 뭐 먹지', '잠깐 산책'],
    })

    // 오후 근무
    blocks.push({
      startHour: 13,
      endHour: pattern.workEnd,
      activity: '오후 근무',
      energyCost: 0.5,
      noisePool: pattern.noises.slice(1),
    })

    // 퇴근
    if (pattern.commute > 0) {
      blocks.push({
        startHour: pattern.workEnd,
        endHour: pattern.workEnd + pattern.commute,
        activity: '퇴근',
        energyCost: 0.2,
        noisePool: ['퇴근길 노래', '집 가는 길'],
      })
    }
  }

  // 저녁
  const eveningStart = isWeekend ? 18 : Math.max(18, pattern.workEnd + pattern.commute)
  blocks.push({
    startHour: eveningStart,
    endHour: eveningStart + 1,
    activity: '저녁 식사',
    energyCost: -0.3,
    noisePool: ['저녁 메뉴 고민', '집밥 요리'],
  })

  // 개인 시간
  blocks.push({
    startHour: eveningStart + 1,
    endHour: Math.min(sleepHour, 24),
    activity: '개인 시간',
    energyCost: -0.1,
    noisePool: ['유튜브 시청', 'SNS 스크롤', '독서', '운동', ...SEASON_ACTIVITIES[season] || []],
  })

  // 취침 (빈 블록 방지: sleepHour < 24일 때만 생성)
  if (sleepHour < 24) {
    blocks.push({
      startHour: sleepHour,
      endHour: 24,
      activity: '취침 준비',
      energyCost: -0.5,
      noisePool: ['하루 마무리', '내일 할 일 정리'],
    })
  }

  const variant = `${isWeekend ? 'weekend' : 'weekday'}_${season}_${morningBias > 0 ? 'night' : morningBias < 0 ? 'morning' : 'neutral'}`

  return {
    blocks,
    variant,
    generatedFrom: 'ATUS_PATTERN',
  }
}

// ─── 유틸리티 ────────────────────────────────────────────────

function getSeason(month: number): string {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}
