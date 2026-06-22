/**
 * [Daily Template 데이터]
 * 직업별 시간 블록 템플릿 상수.
 * v2 신규 모듈 — HTN Lite 방식의 직업별 하루 구조.
 *
 * 설계 출처: 뉴런 알고리즘 설계서 v2 §3
 */

// ─── 타입 ────────────────────────────────────────────────────

export interface TimeBlock {
  startHour: number    // 0~23
  endHour: number      // 0~23
  activity: string
  category: 'WORK' | 'COMMUTE' | 'MEAL' | 'REST' | 'HOBBY' | 'SOCIAL' | 'SLEEP'
  energyImpact: number // -0.3 ~ +0.3
  noisePool?: string[]
}

export type TemplateVariant = 'WEEKDAY' | 'WEEKEND' | 'SPECIAL'

export interface DailyTemplate {
  occupation: string
  variant: TemplateVariant
  specialLabel?: string
  blocks: TimeBlock[]
}

// ─── 직업별 템플릿 ───────────────────────────────────────────

const TEMPLATES: DailyTemplate[] = [
  // ═══════════════════════════════════════════════════════════
  // 1. 학생
  // ═══════════════════════════════════════════════════════════
  {
    occupation: '학생', variant: 'WEEKDAY',
    blocks: [
      { startHour: 7, endHour: 8, activity: '기상+준비', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 8, endHour: 9, activity: '등교', category: 'COMMUTE', energyImpact: -0.1 },
      { startHour: 9, endHour: 12, activity: '오전 수업', category: 'WORK', energyImpact: -0.2,
        noisePool: ['강의실에 10분 일찍 왔는데 아무도 없다', '필기를 열심히 하다 손이 아프다'] },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1,
        noisePool: ['학식이 의외로 맛있는 날', '점심 뭐 먹을지 고민하다 시간 다 감'] },
      { startHour: 13, endHour: 17, activity: '오후 수업/자습', category: 'WORK', energyImpact: -0.3,
        noisePool: ['도서관 자리 뺏김', '과제 마감이 3시간 남았는데 아직 0%'] },
      { startHour: 17, endHour: 18, activity: '하교', category: 'COMMUTE', energyImpact: 0 },
      { startHour: 18, endHour: 19, activity: '저녁', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 19, endHour: 22, activity: '개인시간', category: 'HOBBY', energyImpact: 0.1,
        noisePool: ['카페에서 공부하는 척하며 멍때리는 중', '넷플릭스 한 편만 보려다 세 편'] },
      { startHour: 22, endHour: 7, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '학생', variant: 'WEEKEND',
    blocks: [
      { startHour: 9, endHour: 10, activity: '늦잠+기상', category: 'REST', energyImpact: 0.2 },
      { startHour: 10, endHour: 12, activity: '자유시간', category: 'HOBBY', energyImpact: 0.1 },
      { startHour: 12, endHour: 13, activity: '브런치', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 17, activity: '과제/아르바이트', category: 'WORK', energyImpact: -0.2,
        noisePool: ['주말에도 과제가 있다는 현실', '알바 끝나고 맥주 한 잔'] },
      { startHour: 17, endHour: 22, activity: '여가', category: 'SOCIAL', energyImpact: 0.1 },
      { startHour: 22, endHour: 9, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '학생', variant: 'SPECIAL', specialLabel: '시험기간',
    blocks: [
      { startHour: 6, endHour: 7, activity: '기상', category: 'MEAL', energyImpact: 0 },
      { startHour: 7, endHour: 12, activity: '집중 공부', category: 'WORK', energyImpact: -0.3,
        noisePool: ['벼락치기의 신이 강림할 때', '눈이 침침하다'] },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 18, activity: '오후 공부', category: 'WORK', energyImpact: -0.3 },
      { startHour: 18, endHour: 19, activity: '저녁', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 19, endHour: 23, activity: '야간 공부', category: 'WORK', energyImpact: -0.2 },
      { startHour: 23, endHour: 6, activity: '수면', category: 'SLEEP', energyImpact: 0.4 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 2. 개발자/엔지니어
  // ═══════════════════════════════════════════════════════════
  {
    occupation: '개발자/엔지니어', variant: 'WEEKDAY',
    blocks: [
      { startHour: 8, endHour: 9, activity: '기상+커피', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 9, endHour: 10, activity: '출근/재택 세팅', category: 'COMMUTE', energyImpact: -0.1 },
      { startHour: 10, endHour: 12, activity: '오전 코딩', category: 'WORK', energyImpact: -0.2,
        noisePool: ['모니터 앞에서 멍하니 커서 깜빡이는 걸 보고 있다', '이어폰 끼고 몰입'] },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1,
        noisePool: ['점심 뭐 먹을지가 오늘의 가장 어려운 문제'] },
      { startHour: 13, endHour: 14, activity: '회의', category: 'WORK', energyImpact: -0.1 },
      { startHour: 14, endHour: 18, activity: '오후 코딩', category: 'WORK', energyImpact: -0.3,
        noisePool: ['깃 커밋 메시지를 5분째 고민 중', '이어폰 끼고 코딩하다 보니 해가 졌다'] },
      { startHour: 18, endHour: 19, activity: '퇴근', category: 'COMMUTE', energyImpact: 0 },
      { startHour: 19, endHour: 20, activity: '저녁', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 20, endHour: 23, activity: '개인시간', category: 'HOBBY', energyImpact: 0.1,
        noisePool: ['사이드 프로젝트 잠깐만 하려다 새벽', '유튜브 알고리즘에 빠짐'] },
      { startHour: 23, endHour: 8, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '개발자/엔지니어', variant: 'WEEKEND',
    blocks: [
      { startHour: 9, endHour: 10, activity: '늦잠+기상', category: 'REST', energyImpact: 0.2 },
      { startHour: 10, endHour: 12, activity: '자유시간', category: 'HOBBY', energyImpact: 0.1 },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 17, activity: '사이드 프로젝트/게임', category: 'HOBBY', energyImpact: 0,
        noisePool: ['사이드 프로젝트 하루종일 삽질', '게임 하다 시간 증발'] },
      { startHour: 17, endHour: 22, activity: '여가/운동', category: 'REST', energyImpact: 0.1 },
      { startHour: 22, endHour: 9, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '개발자/엔지니어', variant: 'SPECIAL', specialLabel: '배포일',
    blocks: [
      { startHour: 7, endHour: 8, activity: '긴급 기상', category: 'MEAL', energyImpact: 0 },
      { startHour: 8, endHour: 12, activity: '배포 준비', category: 'WORK', energyImpact: -0.3,
        noisePool: ['배포 전 심장이 두근거린다', '체크리스트 3번째 검토 중'] },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 18, activity: '배포+모니터링', category: 'WORK', energyImpact: -0.3 },
      { startHour: 18, endHour: 22, activity: '안정화 확인', category: 'WORK', energyImpact: -0.2 },
      { startHour: 22, endHour: 7, activity: '수면', category: 'SLEEP', energyImpact: 0.4 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 3. 교육자
  // ═══════════════════════════════════════════════════════════
  {
    occupation: '교육자', variant: 'WEEKDAY',
    blocks: [
      { startHour: 6, endHour: 7, activity: '기상+준비', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 7, endHour: 8, activity: '출근', category: 'COMMUTE', energyImpact: -0.1 },
      { startHour: 8, endHour: 12, activity: '수업', category: 'WORK', energyImpact: -0.2,
        noisePool: ['1교시 시작', '분필 가루 옷에 묻음', '아이들이 유독 시끄러운 날'] },
      { startHour: 12, endHour: 13, activity: '급식/점심', category: 'MEAL', energyImpact: 0.1,
        noisePool: ['급식 맛있는 날은 교실이 조용함'] },
      { startHour: 13, endHour: 16, activity: '오후 수업', category: 'WORK', energyImpact: -0.3 },
      { startHour: 16, endHour: 17, activity: '방과후/행정', category: 'WORK', energyImpact: -0.1,
        noisePool: ['하교 후의 고요함', '학부모 면담 후 피로'] },
      { startHour: 17, endHour: 18, activity: '퇴근', category: 'COMMUTE', energyImpact: 0 },
      { startHour: 18, endHour: 19, activity: '저녁', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 19, endHour: 21, activity: '개인시간', category: 'HOBBY', energyImpact: 0.1 },
      { startHour: 21, endHour: 22, activity: '하루정리', category: 'REST', energyImpact: -0.1 },
      { startHour: 22, endHour: 6, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '교육자', variant: 'WEEKEND',
    blocks: [
      { startHour: 8, endHour: 9, activity: '늦잠', category: 'REST', energyImpact: 0.2 },
      { startHour: 9, endHour: 12, activity: '수업 준비/채점', category: 'WORK', energyImpact: -0.1 },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 17, activity: '자유시간', category: 'HOBBY', energyImpact: 0.1 },
      { startHour: 17, endHour: 22, activity: '여가', category: 'REST', energyImpact: 0.1 },
      { startHour: 22, endHour: 8, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '교육자', variant: 'SPECIAL', specialLabel: '방학',
    blocks: [
      { startHour: 8, endHour: 9, activity: '늦잠+기상', category: 'REST', energyImpact: 0.2 },
      { startHour: 9, endHour: 12, activity: '연수/자습', category: 'WORK', energyImpact: -0.1 },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 17, activity: '독서/취미', category: 'HOBBY', energyImpact: 0 },
      { startHour: 17, endHour: 22, activity: '자유시간', category: 'REST', energyImpact: 0.1 },
      { startHour: 22, endHour: 8, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 4. 자영업자
  // ═══════════════════════════════════════════════════════════
  {
    occupation: '자영업자', variant: 'WEEKDAY',
    blocks: [
      { startHour: 7, endHour: 8, activity: '기상+준비', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 8, endHour: 9, activity: '오픈 준비', category: 'WORK', energyImpact: -0.1,
        noisePool: ['에스프레소 머신 워밍업', '문 열기 전 혼자만의 시간'] },
      { startHour: 9, endHour: 12, activity: '오전 영업', category: 'WORK', energyImpact: -0.2,
        noisePool: ['단골이 오면 하루가 괜찮아진다', '비 오는 날 손님이 줄어드는 법칙'] },
      { startHour: 12, endHour: 13, activity: '간단한 점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 18, activity: '오후 영업', category: 'WORK', energyImpact: -0.3,
        noisePool: ['재고 정리하다 보니 저녁이다', '에스프레소 머신 또 고장'] },
      { startHour: 18, endHour: 20, activity: '마감/정산', category: 'WORK', energyImpact: -0.1,
        noisePool: ['매출 장부 보면서 한숨'] },
      { startHour: 20, endHour: 21, activity: '저녁', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 21, endHour: 22, activity: '개인시간', category: 'REST', energyImpact: 0.1 },
      { startHour: 22, endHour: 7, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '자영업자', variant: 'WEEKEND',
    blocks: [
      { startHour: 7, endHour: 8, activity: '기상', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 8, endHour: 18, activity: '주말 영업 (피크)', category: 'WORK', energyImpact: -0.3,
        noisePool: ['주말 대목이다', '손님 줄이 문 밖까지'] },
      { startHour: 18, endHour: 20, activity: '마감', category: 'WORK', energyImpact: -0.1 },
      { startHour: 20, endHour: 22, activity: '저녁+휴식', category: 'REST', energyImpact: 0.1 },
      { startHour: 22, endHour: 7, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '자영업자', variant: 'SPECIAL', specialLabel: '휴무일',
    blocks: [
      { startHour: 9, endHour: 10, activity: '늦잠', category: 'REST', energyImpact: 0.3 },
      { startHour: 10, endHour: 12, activity: '밀린 집안일', category: 'REST', energyImpact: -0.1 },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 17, activity: '자유시간', category: 'HOBBY', energyImpact: 0.2 },
      { startHour: 17, endHour: 22, activity: '여가/사람 만남', category: 'SOCIAL', energyImpact: 0.1 },
      { startHour: 22, endHour: 9, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 5. 사무직/회사원
  // ═══════════════════════════════════════════════════════════
  {
    occupation: '사무직/회사원', variant: 'WEEKDAY',
    blocks: [
      { startHour: 7, endHour: 8, activity: '기상+준비', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 8, endHour: 9, activity: '출근', category: 'COMMUTE', energyImpact: -0.1,
        noisePool: ['엘리베이터 기다리며 하늘 보기'] },
      { startHour: 9, endHour: 12, activity: '오전 업무', category: 'WORK', energyImpact: -0.2,
        noisePool: ['결재 서류 12건이 밀려있다', '회의가 회의를 낳는 하루'] },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1,
        noisePool: ['구내식당 메뉴 확인이 아침 첫 루틴'] },
      { startHour: 13, endHour: 18, activity: '오후 업무', category: 'WORK', energyImpact: -0.3,
        noisePool: ['오후 3시의 졸음', '커피 2잔째'] },
      { startHour: 18, endHour: 19, activity: '퇴근', category: 'COMMUTE', energyImpact: 0,
        noisePool: ['칼퇴 성공한 날의 기쁨'] },
      { startHour: 19, endHour: 20, activity: '저녁', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 20, endHour: 22, activity: '개인시간', category: 'HOBBY', energyImpact: 0.1 },
      { startHour: 22, endHour: 7, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '사무직/회사원', variant: 'WEEKEND',
    blocks: [
      { startHour: 9, endHour: 10, activity: '늦잠', category: 'REST', energyImpact: 0.2 },
      { startHour: 10, endHour: 12, activity: '밀린 집안일', category: 'REST', energyImpact: -0.1 },
      { startHour: 12, endHour: 13, activity: '브런치', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 17, activity: '외출/취미', category: 'HOBBY', energyImpact: 0.1 },
      { startHour: 17, endHour: 22, activity: '여가', category: 'REST', energyImpact: 0.1 },
      { startHour: 22, endHour: 9, activity: '수면', category: 'SLEEP', energyImpact: 0.5 },
    ],
  },
  {
    occupation: '사무직/회사원', variant: 'SPECIAL', specialLabel: '야근일',
    blocks: [
      { startHour: 7, endHour: 8, activity: '기상', category: 'MEAL', energyImpact: 0 },
      { startHour: 8, endHour: 9, activity: '출근', category: 'COMMUTE', energyImpact: -0.1 },
      { startHour: 9, endHour: 12, activity: '오전 업무', category: 'WORK', energyImpact: -0.2 },
      { startHour: 12, endHour: 13, activity: '점심', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 13, endHour: 18, activity: '오후 업무', category: 'WORK', energyImpact: -0.3 },
      { startHour: 18, endHour: 19, activity: '저녁 (사내)', category: 'MEAL', energyImpact: 0.1 },
      { startHour: 19, endHour: 22, activity: '야근', category: 'WORK', energyImpact: -0.3,
        noisePool: ['야근 3시간째 집이 그립다', '편의점 커피가 오늘의 연료'] },
      { startHour: 22, endHour: 7, activity: '수면', category: 'SLEEP', energyImpact: 0.4 },
    ],
  },
]

// ─── 조회 함수 ───────────────────────────────────────────────

/**
 * 직업명과 variant로 Daily Template을 조회합니다.
 * 매칭 안 되면 사무직/회사원 WEEKDAY를 fallback으로 반환.
 */
export function getDailyTemplate(
  occupation: string,
  variant: TemplateVariant = 'WEEKDAY',
): DailyTemplate {
  const found = TEMPLATES.find(
    (t) => t.occupation === occupation && t.variant === variant,
  )
  if (found) return found

  // variant fallback: SPECIAL/WEEKEND → WEEKDAY
  const weekday = TEMPLATES.find(
    (t) => t.occupation === occupation && t.variant === 'WEEKDAY',
  )
  if (weekday) return weekday

  // occupation fallback
  return TEMPLATES.find(
    (t) => t.occupation === '사무직/회사원' && t.variant === 'WEEKDAY',
  )!
}

/** 등록된 전체 직업 목록 */
export function getRegisteredOccupations(): string[] {
  return [...new Set(TEMPLATES.map((t) => t.occupation))]
}
