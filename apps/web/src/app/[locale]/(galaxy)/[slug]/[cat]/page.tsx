import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCachedGalaxyByPartnerCodeWithCategories } from '@/shared/lib/queries'
import { GalaxyRouteInitializer } from '@/widgets/galaxy-canvas/GalaxyRouteInitializer'

type Props = {
  params: Promise<{ slug: string; cat: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, cat } = await params

  const galaxy = await getCachedGalaxyByPartnerCodeWithCategories(slug)
  if (!galaxy) return { title: 'Pixelyf' }

  const category = galaxy.categories.find(
    (c: any) => c.key.toLowerCase() === cat.toLowerCase()
  )

  const t = await getTranslations('Metadata')

  return {
    title: category
      ? t('categoryTitle', { category: category.name, galaxy: galaxy.name })
      : t('galaxyTitle', { name: galaxy.name }),
    description: category
      ? t('galaxyCategoryExplore', { galaxy: galaxy.name, category: category.name })
      : t('galaxyExplore', { name: galaxy.name }),
  }
}

export default async function GalaxyCategoryPage({ params }: Props) {
  const { slug, cat } = await params

  const galaxy = await getCachedGalaxyByPartnerCodeWithCategories(slug)
  if (!galaxy) notFound()

  const category = galaxy.categories.find(
    (c: any) => c.key.toLowerCase() === cat.toLowerCase()
  )
  if (!category) notFound()

  return <GalaxyRouteInitializer galaxyKey={galaxy.key} activeCategory={category.key} />
}
