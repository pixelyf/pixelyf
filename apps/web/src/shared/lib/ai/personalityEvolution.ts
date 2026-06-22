/**
 * [v4 Personality Evolution]
 * 장기 기억 축적에 따라 MBTI 10축 점수를 미세하게 변화시킵니다.
 * OCEAN Big Five (Costa & McCrae 1992) + Dwarf Fortress 성격 시뮬레이션 기반.
 *
 * 호출 시점: Reflection DEEP 배치 후
 *
 * 규칙:
 *   - RELATIONSHIP 승격 3건+ → score_e_i +1 (외향 방향)
 *   - IDENTITY 승격 3건+ → score_depth_broad +1 (깊이 방향)
 *   - EVENT 승격 3건+ → score_yolo_future +1 (YOLO 방향)
 *   - 최대 변동폭: 축당 ±2/분기
 *   - 절대 범위: 20~80 (극단 방지)
 *
 * 설계 출처: docs/2_AI_은하_설계/3_뉴런_알고리즘_설계서_v3_v4.md Part C
 */

import prisma from '@/shared/lib/prisma'
import { buildActiveMemoryWhere } from './memorySemantics'

// ─── 타입 ────────────────────────────────────────────────────

export interface PersonalityDelta {
  axis: string     // UserPersona 컬럼명 (score_e_i, score_s_n, ...)
  delta: number    // -2 ~ +2
  reason: string   // 변화 사유
}

export interface EvolutionResult {
  deltas: PersonalityDelta[]
  applied: boolean
}

// ─── 상수 ────────────────────────────────────────────────────

/** 최근 승격 기억 조회 범위 (14일 = 2주, DEEP 배치 주기와 맞춤) */
const LOOKBACK_DAYS = 14

/** 카테고리별 최소 건수 (이 이상이면 성격 변화 트리거) */
const MIN_CATEGORY_COUNT = 3

/** 축당 최대 단일 변동폭 */
const MAX_DELTA_PER_AXIS = 2

/** 절대 범위 (극단 방지) */
const SCORE_MIN = 20
const SCORE_MAX = 80

/** promotedCategory → 성격 축 매핑 */
const CATEGORY_AXIS_MAP: Record<string, { axis: string; direction: number; reason: string }[]> = {
  RELATIONSHIP: [
    { axis: 'score_e_i', direction: +1, reason: '최근 사회적 교류 증가 → 외향 방향' },
    { axis: 'score_t_f', direction: +1, reason: '관계 기억이 많아짐 → 감성 방향' },
  ],
  IDENTITY: [
    { axis: 'score_depth_broad', direction: +1, reason: '자아 탐색 기억 증가 → 깊이 방향' },
    { axis: 'score_s_n', direction: +1, reason: '내면 성찰 기억 증가 → 직관 방향' },
  ],
  EVENT: [
    { axis: 'score_yolo_future', direction: +1, reason: '사건 경험 기억 증가 → YOLO 방향' },
    { axis: 'score_calm_vibrant', direction: +1, reason: '활동적 사건 증가 → 활발 방향' },
  ],
}

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * Reflection DEEP 후 호출하여 성격을 미세 조정합니다.
 *
 * @param soulId AI Soul ID
 * @returns 변화 델타 목록과 적용 여부
 */
export async function evolvePersonality(
  soulId: string,
): Promise<EvolutionResult> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  // 1. 최근 승격 기억의 카테고리별 카운트
  const promotedMemories = await prisma.aiMemory.findMany({
    where: {
      aiSoulId: soulId,
      memoryStream: { in: ['OWNER', 'SELF'] },
      memoryLayer: 'LONG_TERM',
      isPromoted: true,
      promotedAt: { gte: since },
      ...buildActiveMemoryWhere(),
    },
    select: { promotedCategory: true },
  })

  if (promotedMemories.length === 0) return { deltas: [], applied: false }

  // 카테고리별 카운트
  const categoryCounts: Record<string, number> = {}
  for (const mem of promotedMemories) {
    const cat = mem.promotedCategory || 'EVENT'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  }

  // 2. 델타 계산
  const deltas: PersonalityDelta[] = []

  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count < MIN_CATEGORY_COUNT) continue

    const mappings = CATEGORY_AXIS_MAP[category]
    if (!mappings) continue

    for (const mapping of mappings) {
      // 건수에 비례한 delta (3건=1, 6건=2, 최대 2)
      const rawDelta = Math.min(MAX_DELTA_PER_AXIS, Math.floor(count / MIN_CATEGORY_COUNT))
      const delta = rawDelta * mapping.direction

      deltas.push({
        axis: mapping.axis,
        delta,
        reason: mapping.reason,
      })
    }
  }

  if (deltas.length === 0) return { deltas: [], applied: false }

  // 3. 같은 축에 대한 중복 델타 병합
  const mergedDeltas = mergeDeltas(deltas)

  // 4. UserPersona 업데이트
  const soul = await prisma.aiSoul.findUnique({
    where: { id: soulId },
    select: { userId: true },
  })
  if (!soul) return { deltas: mergedDeltas, applied: false }

  const persona = await prisma.userPersona.findUnique({
    where: { user_id: soul.userId },
  })
  if (!persona) return { deltas: mergedDeltas, applied: false }

  // 각 축에 delta 적용 (범위 클램프)
  const updateData: Record<string, number> = {}
  for (const d of mergedDeltas) {
    const currentValue = (persona as Record<string, unknown>)[d.axis] as number ?? 50
    const newValue = clamp(currentValue + d.delta, SCORE_MIN, SCORE_MAX)
    if (newValue !== currentValue) {
      updateData[d.axis] = newValue
    }
  }

  if (Object.keys(updateData).length === 0) return { deltas: mergedDeltas, applied: false }

  await prisma.userPersona.update({
    where: { user_id: soul.userId },
    data: updateData,
  })

  console.log(`[PersonalityEvolution] soulId=${soulId}:`, mergedDeltas.map(d => `${d.axis} ${d.delta > 0 ? '+' : ''}${d.delta}`).join(', '))
  return { deltas: mergedDeltas, applied: true }
}

// ─── 유틸리티 ────────────────────────────────────────────────

function mergeDeltas(deltas: PersonalityDelta[]): PersonalityDelta[] {
  const merged = new Map<string, PersonalityDelta>()

  for (const d of deltas) {
    const existing = merged.get(d.axis)
    if (existing) {
      existing.delta = clamp(existing.delta + d.delta, -MAX_DELTA_PER_AXIS, MAX_DELTA_PER_AXIS)
      existing.reason += '; ' + d.reason
    } else {
      merged.set(d.axis, { ...d })
    }
  }

  return Array.from(merged.values())
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
