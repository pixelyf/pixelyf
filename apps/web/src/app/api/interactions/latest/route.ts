import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from "@/shared/lib/prisma";

export const forceDynamic = 'force-dynamic';

/**
 * GET /api/interactions/latest
 * 특정 유저와 캐릭터 간의 1:1 전용 AI 상호작용 메시지를 조회합니다.
 * (최근 24시간 이내 데이터만 반환하도록 설계 12번 보정)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const charId = searchParams.get('charId') // 머물고 있는 픽셀의 UUID

    if (!charId) {
      return NextResponse.json({ error: 'charId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user: sessionUser } } = await supabase.auth.getUser()

    // 2차 보정: 쿼리 파라미터 userId 대신 서버 세션 ID를 직접 사용하여 보안 강화
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = sessionUser.id;

    // 1. charId(UUID)를 통해 캐릭터 정보(pixel_id) 조회
    const targetUser = await prisma.user.findUnique({
      where: { id: charId },
      select: { pixel_id: true }
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    // 2. 해당 캐릭터가 AI인지 확인 (character_code는 pixel_id의 대문자 형태)
    const characterCode = targetUser.pixel_id.toUpperCase();

    // 2차 보정: 설계 12번 지침에 따라 최근 24시간 이내의 데이터만 필터링
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 3. 최신 상호작용 조회
    const latestInteraction = await prisma.aiInteraction.findFirst({
      where: {
        user_id: userId,
        character_code: characterCode,
        status: 'completed',
        message: { not: null },
        processed_at: {
          gte: twentyFourHoursAgo // 24시간 이내 조건 추가
        }
      },
      orderBy: {
        processed_at: 'desc'
      },
      select: {
        id: true,
        message: true,
        trigger_type: true,
        processed_at: true
      }
    });

    if (!latestInteraction) {
      return NextResponse.json({ message: null });
    }

    return NextResponse.json(latestInteraction);
  } catch (error) {
    console.error('[Latest Interaction Fetch Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
