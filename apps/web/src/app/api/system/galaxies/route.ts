import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

/**
 * GET /api/system/galaxies
 * 활성 은하 + 카테고리 목록 (공개, 인증 불필요)
 * 프론트엔드 UI 동적 렌더링용 — GalaxyHeader, SearchFeedDrawer 등에서 소비
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const locale = searchParams.get('locale') || request.headers.get('accept-language')?.split(',')[0]?.split('-')[0] || 'ko'

    const galaxies = await prisma.galaxy.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        key: true,
        partnerCode: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        centerX: true,
        centerY: true,
        isRoot: true,
        sortOrder: true,
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            galaxyId: true,
            key: true,
            name: true,
            description: true,
            icon: true,
            color: true,
            type: true,
            sortOrder: true,
            translations: {
              select: { locale: true, name: true, description: true }
            }
          },
        },
      },
    })

    // [BFP 실시간 다국어 매핑] 클라이언트 locale에 대응해 카테고리명/설명 실시간 갈아끼우기
    const mappedGalaxies = galaxies.map((g) => {
      return {
        ...g,
        categories: g.categories.map((cat) => {
          const matchedTranslation = cat.translations.find((t) => t.locale === locale)
          return {
            id: cat.id,
            galaxyId: cat.galaxyId,
            key: cat.key,
            name: matchedTranslation?.name || cat.name,
            description: matchedTranslation?.description || cat.description,
            icon: cat.icon,
            color: cat.color,
            type: cat.type,
            sortOrder: cat.sortOrder,
          }
        }),
      }
    })

    return NextResponse.json({ data: mappedGalaxies }, {
      headers: {
        // 24시간 캐싱 및 Accept-Language/locale 쿼리별 안전 Vary 격리 분기
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
        'Vary': 'Accept-Language, Accept',
      },
    })
  } catch (error) {
    console.error('System galaxies API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
