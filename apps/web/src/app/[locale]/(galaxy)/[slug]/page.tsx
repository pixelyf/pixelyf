import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCachedGalaxyByPartnerCode, getCachedRootGalaxy } from '@/shared/lib/queries'
import { GalaxyRouteInitializer } from '@/widgets/galaxy-canvas/GalaxyRouteInitializer'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  // 1순위: 은하 partnerCode 매칭
  const galaxy = await getCachedGalaxyByPartnerCode(slug)
  if (galaxy) {
    const t = await getTranslations('Metadata')
    return {
      title: t('galaxyTitle', { name: galaxy.name }),
      description: t('galaxyExplore', { name: galaxy.name }),
    }
  }

  // 2순위: 루트 은하의 카테고리 매칭
  const rootGalaxy = await getCachedRootGalaxy()
  if (rootGalaxy) {
    const category = rootGalaxy.categories.find(
      (c: any) => c.key.toLowerCase() === slug.toLowerCase()
    )
    if (category) {
      const t = await getTranslations('Metadata')
      return {
        title: t('categoryTitle', { category: category.name, galaxy: rootGalaxy.name }),
        description: t('galaxyCategoryExplore', { galaxy: rootGalaxy.name, category: category.name }),
      }
    }
  }

  return { title: 'Pixelyf' }
}

export default async function GalaxySlugPage({ params, searchParams }: Props) {
  const { slug } = await params

  // 1순위: 은하 partnerCode 매칭
  const galaxy = await getCachedGalaxyByPartnerCode(slug)

  if (galaxy) {
    return <GalaxyRouteInitializer galaxyKey={galaxy.key} />
  }

  // 2순위: 루트 은하(PIXELYF)의 카테고리 매칭
  const rootGalaxy = await getCachedRootGalaxy()

  if (rootGalaxy) {
    const category = rootGalaxy.categories.find(
      (c: any) => c.key.toLowerCase() === slug.toLowerCase()
    )
    if (category) {
      return <GalaxyRouteInitializer galaxyKey={rootGalaxy.key} activeCategory={category.key} />
    }
  }

  notFound()
}
