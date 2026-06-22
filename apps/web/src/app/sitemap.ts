import { MetadataRoute } from 'next'
import prisma from '@/shared/lib/prisma'
import { SUPPORTED_LOCALES } from '@/i18n/routing'

/**
 * 픽셀리프 (Pixelyf) 동적 사이트맵 생성기
 * - Core 유저 (Evolution Score 높은 순) 최대 1,000명
 * - 인기 피드 (최근 작성된 Moment) 최대 1,000개
 * - 각 노드에 다국어 alternate URL 자동 매핑
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://pixelyf.com'

  // 다국어 alternates 헬퍼 함수
  const getAlternates = (path: string) => {
    const languages: Record<string, string> = {}
    SUPPORTED_LOCALES.forEach((locale) => {
      const prefix = locale === 'ko' ? '' : `/${locale}`
      languages[locale] = `${baseUrl}${prefix}${path}`
    })
    return { languages }
  }

  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 1.0,
      alternates: getAlternates(''),
    },
    {
      url: `${baseUrl}/brand`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
      alternates: getAlternates('/brand'),
    }
  ]

  try {
    // 1. 코어 유저 (Evolution Score 기준 상위 1,000명 - SEO 서버 부하 방지를 위해 제한)
    const topUsers = await prisma.user.findMany({
      take: 1000,
      orderBy: { activity_score: 'desc' },
      select: { id: true, updated_at: true },
      where: {
        is_active: true,
        display_name: { not: '' },
      }
    })

    topUsers.forEach((user) => {
      routes.push({
        url: `${baseUrl}?pixel=${user.id}`,
        lastModified: user.updated_at || new Date(),
        changeFrequency: 'daily',
        priority: 0.9,
        alternates: getAlternates(`?pixel=${user.id}`),
      })
    })

    // 2. 인기/최신 피드 (상위 1,000개)
    const recentFeeds = await prisma.moment.findMany({
      take: 1000,
      orderBy: { created_at: 'desc' },
      select: { id: true, created_at: true },
      where: { is_deleted: false }
    })

    recentFeeds.forEach((feed) => {
      routes.push({
        url: `${baseUrl}?feed=${feed.id}`,
        lastModified: feed.created_at || new Date(),
        changeFrequency: 'hourly',
        priority: 0.8,
        alternates: getAlternates(`?feed=${feed.id}`),
      })
    })

  } catch (e) {
    console.error('Sitemap generation failed:', e)
  }

  return routes
}
