import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const locale = searchParams.get('locale') || request.headers.get('accept-language')?.split(',')[0]?.split('-')[0] || 'ko'

    const galaxies = await prisma.galaxy.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
      include: {
        categories: {
          where: {
            isActive: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
          include: {
            translations: true,
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
            isActive: cat.isActive,
            sortOrder: cat.sortOrder,
            createdAt: cat.createdAt,
          }
        }),
      }
    })

    return NextResponse.json({ galaxies: mappedGalaxies })
  } catch (error) {
    console.error('Fetch Galaxies Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
