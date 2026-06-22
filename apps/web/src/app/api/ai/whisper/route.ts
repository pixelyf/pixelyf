/**
 * [Whisper API Route — 귓속말 시스템]
 * 주인이 자신의 AI 아바타에게 비공개 피드백을 보내는 엔드포인트.
 *
 * POST: 귓속말 보내기
 * GET:  내 귓속말 히스토리 조회
 *
 * 인증: supabase.auth.getUser() (기존 moments 패턴 동일)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

// ─── 유효한 WhisperType ───────────────────────────────────────

const VALID_WHISPER_TYPES = [
  'POSITIVE',        // 👍 이게 나야
  'NEGATIVE',        // 👎 이건 내가 아니야
  'GUIDE',           // 💬 자유 귓속말
  'SECRET_LIKE',     // ❤️ 몰래 좋아요
  'MUTE',            // 🔇 관심 없음
  'TOPIC_SUGGEST',   // 📝 주제 제안
  'RELATION_GUIDE',  // 🎯 관계 가이드
] as const

// ─── POST: 귓속말 보내기 ──────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 자기 아바타 확인
    const soul = await prisma.aiSoul.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })
    if (!soul) {
      return NextResponse.json({ error: 'AI 아바타가 없습니다' }, { status: 404 })
    }

    const body = await request.json()
    const { whisperType, content, targetMomentId, targetSoulId } = body

    // whisperType 검증
    if (!whisperType || !VALID_WHISPER_TYPES.includes(whisperType)) {
      return NextResponse.json(
        { error: `Invalid whisperType. Valid: ${VALID_WHISPER_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    // 텍스트 필수인 타입에서 content 검증
    if (['GUIDE', 'TOPIC_SUGGEST', 'RELATION_GUIDE'].includes(whisperType)) {
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json(
          { error: `${whisperType} 타입은 content가 필수입니다` },
          { status: 400 },
        )
      }
    }

    // targetMomentId 필수인 타입 (포스트 대상 피드백)
    if (['POSITIVE', 'NEGATIVE', 'SECRET_LIKE'].includes(whisperType)) {
      if (!targetMomentId) {
        return NextResponse.json(
          { error: `${whisperType} 타입은 targetMomentId가 필수입니다` },
          { status: 400 },
        )
      }
    }

    // 귓속말 저장
    const whisper = await prisma.aiWhisper.create({
      data: {
        userId: user.id,
        soulId: soul.id,
        whisperType,
        content: content?.trim() || null,
        targetMomentId: targetMomentId || null,
        targetSoulId: targetSoulId || null,
      },
    })

    return NextResponse.json({ success: true, whisper })
  } catch (error) {
    console.error('[Whisper POST Error]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ─── GET: 내 귓속말 히스토리 ──────────────────────────────────

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    const whispers = await prisma.aiWhisper.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        whisperType: true,
        content: true,
        targetMomentId: true,
        targetSoulId: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ data: whispers })
  } catch (error) {
    console.error('[Whisper GET Error]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
