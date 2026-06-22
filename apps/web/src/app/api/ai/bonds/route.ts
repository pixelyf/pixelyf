/**
 * [Phase D] AI 공명 연결(Resonance Bond) 조회 API
 *
 * GET /api/ai/bonds?soulId={soulId}
 *
 * 특정 AI Soul의 공명 연결 목록을 반환합니다.
 * - Raw Score에 Read-Time 지수 감쇠(λ=0.0042, 반감기 7일)를 적용한 Effective Score 포함
 * - disconnected 상태는 제외 (프론트에서 렌더링하지 않으므로)
 *
 * 설계 출처: docs/1_기획_및_설계/AI은하/11_AI은하_공명연결_알고리즘.md §5
 */

import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

// ─── Read-Time Decay 상수 ────────────────────────────────────
// λ = ln(2) / (7일 × 24시간) ≈ 0.00413
// 반감기 7일: Snapchat Best Friends 7-day Rolling Window 근사
const DECAY_LAMBDA = 0.00413

/** effectiveScore = rawScore × e^(-λ × Δt_hours) */
function calculateEffectiveScore(rawScore: number, lastInteractionAt: Date | null): number {
  if (!lastInteractionAt || rawScore <= 0) return 0

  const deltaHours = (Date.now() - lastInteractionAt.getTime()) / (1000 * 60 * 60)
  const effective = rawScore * Math.exp(-DECAY_LAMBDA * deltaHours)

  // 소수 둘째자리까지 반올림
  return Math.round(effective * 100) / 100
}

// ─── API Route ───────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const soulId = searchParams.get('soulId')

  if (!soulId) {
    return NextResponse.json({ error: 'soulId parameter required' }, { status: 400 })
  }

  // Soul 존재 확인
  const soul = await prisma.aiSoul.findUnique({
    where: { id: soulId },
    select: { id: true, userId: true },
  })

  if (!soul) {
    return NextResponse.json({ error: 'Soul not found' }, { status: 404 })
  }

  // 해당 Soul의 모든 bond 조회 (disconnected 제외)
  const bonds = await prisma.aiSoulBond.findMany({
    where: {
      OR: [
        { soulAId: soulId },
        { soulBId: soulId },
      ],
      status: { in: ['pending', 'connected', 'fading'] },
    },
    include: {
      soulA: {
        select: {
          id: true,
          user: { select: { pixel_id: true, display_name: true } },
        },
      },
      soulB: {
        select: {
          id: true,
          user: { select: { pixel_id: true, display_name: true } },
        },
      },
    },
    orderBy: { resonanceScore: 'desc' },
  })

  // 응답 형태로 변환 (Effective Score 포함)
  const result = bonds.map((bond: any) => {
    const isA = bond.soulAId === soulId
    const connectedSoul = isA ? bond.soulB : bond.soulA
    const effectiveScore = calculateEffectiveScore(bond.resonanceScore, bond.lastInteractionAt)

    return {
      bondId: bond.id,
      connectedSoulId: connectedSoul.id,
      connectedPixelId: connectedSoul.user.pixel_id,
      connectedDisplayName: connectedSoul.user.display_name,
      status: bond.status,
      resonanceScore: bond.resonanceScore,
      effectiveScore,
      lastInteractionAt: bond.lastInteractionAt,
      createdAt: bond.createdAt,
    }
  })

  return NextResponse.json({
    soulId,
    totalBonds: result.length,
    connectedCount: result.filter((b: any) => b.status === 'connected').length,
    fadingCount: result.filter((b: any) => b.status === 'fading').length,
    bonds: result,
  })
}
