import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // 1. 인증 확인 (로그인된 사용자만 검색 가능)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')

    // 2. 검색어 길이 체크 (최소 2글자 이상, 프론트와 동일한 조건)
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ data: { users: [] } })
    }

    const searchQuery = query.trim()

    // 3. Prisma를 이용한 사용자 검색 (대소문자 무시)
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { is_active: true }, // 활성화된 사용자만
          { id: { not: user.id } }, // 본인 제외
          {
            OR: [
              { display_name: { contains: searchQuery, mode: 'insensitive' } },
              { pixel_id: { contains: searchQuery, mode: 'insensitive' } },
            ],
          }
        ]
      },
      select: {
        id: true,
        display_name: true,
        avatar_image_url: true,
        pixel_id: true,
      },
      take: 20, // 최대 20명으로 제한
      orderBy: {
        activity_score: 'desc' // 활동 점수가 높은 순으로 정렬 (관련성 높은 유저 노출)
      }
    })

    return NextResponse.json({
      data: { users }
    })
  } catch (error) {
    console.error('[Search Users API Error]:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
