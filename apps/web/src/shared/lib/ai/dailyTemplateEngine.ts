/**
 * [Daily Template 엔진]
 * 직업별 시간 블록 관리 + 현재 블록 반환.
 * v4: dynamicTemplateGenerator를 메인 엔진으로 사용.
 *     ATUS 데이터 기반 동적 생성 + 성격 보정 + 시즌 분기.
 *
 * 설계 출처: 뉴런 알고리즘 설계서 v4 §C — ATUS 기반 Dynamic Template
 */

import { type TimeBlock, type TemplateVariant } from './dailyTemplateData'
import { generateDailyTemplate } from './dynamicTemplateGenerator'

// ─── 타입 ────────────────────────────────────────────────────

export interface CurrentBlockInfo {
  block: TimeBlock
  /** 블록 시작부터 경과 시간 (0.0~1.0) */
  progress: number
  /** 이 블록까지의 누적 에너지 (하루 시작부터) */
  cumulativeEnergy: number
  /** 에너지 라벨 */
  energyLabel: string
}

/** v4: 성격 점수 (옵션 — 미전달 시 중립값 50 사용) */
export interface PersonalityHints {
  morning_night?: number  // 0=극 아침형, 100=극 저녁형
  calm_vibrant?: number   // 0=차분, 100=활발
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 현재 시각에 해당하는 시간 블록 정보를 반환합니다.
 * v4: ATUS 기반 dynamicTemplateGenerator가 모든 직업을 동적 처리.
 *
 * @param occupation 직업 카테고리 (UserPersona.occupation)
 * @param hour 현재 시각 (0~23)
 * @param variant 평일/주말/특수 (기본: WEEKDAY) — 주말이면 동적 생성에 반영
 * @param personality 성격 보정 점수 (옵션)
 */
export function getCurrentBlock(
  occupation: string,
  hour: number,
  variant: TemplateVariant = 'WEEKDAY',
  personality?: PersonalityHints,
): CurrentBlockInfo {
  const now = new Date()
  const isWeekend = variant === 'WEEKEND'

  // v4: ATUS 기반 동적 생성 (모든 직업 커버)
  const generated = generateDailyTemplate(
    occupation,
    {
      morning_night: personality?.morning_night ?? 50,
      calm_vibrant: personality?.calm_vibrant ?? 50,
    },
    {
      dayOfWeek: isWeekend ? 0 : (now.getDay() || 1), // variant 우선 반영
      month: now.getMonth() + 1,
    },
  )

  // dynamicTemplate → dailyTemplateData 포맷으로 변환
  const blocks: TimeBlock[] = generated.blocks.map(b => ({
    startHour: b.startHour,
    endHour: b.endHour,
    activity: b.activity,
    category: mapActivityToCategory(b.activity),
    energyImpact: b.energyCost,
    noisePool: b.noisePool,
  }))

  return resolveBlock(blocks, hour)
}

/** v4: dynamicTemplate의 activity → dailyTemplateData의 category 변환 */
function mapActivityToCategory(activity: string): TimeBlock['category'] {
  const lower = activity.toLowerCase()
  if (lower.includes('수면') || lower.includes('취침')) return 'SLEEP'
  if (lower.includes('출근') || lower.includes('퇴근')) return 'COMMUTE'
  if (lower.includes('점심') || lower.includes('저녁') || lower.includes('아침 루틴')) return 'MEAL'
  if (lower.includes('근무') || lower.includes('업무')) return 'WORK'
  if (lower.includes('개인') || lower.includes('취미') || lower.includes('자유')) return 'HOBBY'
  return 'REST'
}

/** 블록 매칭 + 에너지 계산 공통 로직 */
function resolveBlock(blocks: TimeBlock[], hour: number): CurrentBlockInfo {
  const fallbackBlock = blocks[0]

  // 현재 시각이 포함된 블록 찾기
  let matchedBlock: TimeBlock | null = null
  let matchedIndex = 0

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (isHourInBlock(hour, b.startHour, b.endHour)) {
      matchedBlock = b
      matchedIndex = i
      break
    }
  }

  // fallback: 매칭 안 되면 첫 번째 블록
  if (!matchedBlock) {
    matchedBlock = fallbackBlock
    matchedIndex = 0
  }

  // 블록 내 진행도 계산
  const blockDuration = getBlockDuration(matchedBlock.startHour, matchedBlock.endHour)
  const elapsed = (hour - matchedBlock.startHour + 24) % 24
  const progress = blockDuration > 0 ? Math.min(1, elapsed / blockDuration) : 0

  // 누적 에너지 계산 (하루 시작부터 현재 블록까지)
  let cumulativeEnergy = 0
  for (let i = 0; i <= matchedIndex; i++) {
    if (i < matchedIndex) {
      cumulativeEnergy += blocks[i].energyImpact
    } else {
      // 현재 블록은 진행도만큼 반영
      cumulativeEnergy += blocks[i].energyImpact * progress
    }
  }

  return {
    block: matchedBlock,
    progress,
    cumulativeEnergy,
    energyLabel: getEnergyLabel(cumulativeEnergy),
  }
}

/**
 * 현재 블록의 noisePool에서 랜덤으로 Daily Noise를 선택합니다.
 * noisePool이 없으면 null 반환.
 */
export function pickBlockNoise(blockInfo: CurrentBlockInfo): string | null {
  const pool = blockInfo.block.noisePool
  if (!pool || pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * 현재 요일에 따른 variant를 자동 결정합니다.
 */
export function getVariantFromDate(date: Date): TemplateVariant {
  const day = date.getDay()
  return (day === 0 || day === 6) ? 'WEEKEND' : 'WEEKDAY'
}

// ─── 유틸리티 ────────────────────────────────────────────────

/** 시각이 블록 범위에 포함되는지 (자정 넘김 처리) */
function isHourInBlock(hour: number, start: number, end: number): boolean {
  if (start <= end) {
    return hour >= start && hour < end
  }
  // 자정 넘김 (예: 22~7)
  return hour >= start || hour < end
}

/** 블록 지속 시간 계산 (자정 넘김 처리) */
function getBlockDuration(start: number, end: number): number {
  if (end > start) return end - start
  return (24 - start) + end
}

/** 누적 에너지 → 라벨 */
function getEnergyLabel(energy: number): string {
  if (energy >= 0.3) return '활력 넘침'
  if (energy >= 0.1) return '괜찮은 상태'
  if (energy >= -0.1) return '보통'
  if (energy >= -0.3) return '피곤한 상태'
  return '매우 지친 상태'
}
