import { Metadata, ResolvingMetadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getCachedMoment, getCachedUser } from '@/shared/lib/queries'

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ searchParams }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const t = await getTranslations()
  const params = await searchParams;
  const pixelId = typeof params.pixel === 'string' ? params.pixel : undefined;
  const feedId = typeof params.feed === 'string' ? params.feed : undefined;

  let title = t('Metadata.titleWithRelation')
  let description = t('Metadata.descriptionAlt')
  let ogImage = 'https://pixelyf.com/logo.png'

  if (pixelId) {
    try {
      const user = await getCachedUser(pixelId)
      if (user) {
        title = t('Metadata.userTitle', { name: user.display_name || t('Common.pixelier') })
        description = user.status_message || description
        if (user.avatar_image_url) ogImage = user.avatar_image_url
      }
    } catch (e) { console.error('Metadata generation error:', e) }
  } else if (feedId) {
    try {
      const moment = await getCachedMoment(feedId)
      if (moment && moment.user) {
        title = t('Metadata.momentTitle', { name: moment.user.display_name || t('Common.traveler') })
        description = moment.content || description
        if (moment.image_url) ogImage = moment.image_url
      }
    } catch (e) { console.error('Metadata generation error:', e) }
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [ogImage],
    }
  }
}

export default async function RootGalaxyPage({ searchParams }: Props) {
  const t = await getTranslations()
  const params = await searchParams;
  const feedId = typeof params.feed === 'string' ? params.feed : undefined;
  let feedData = null;

  // [SEO] 구글봇(Googlebot) 검색 수집을 위한 백그라운드 SSR 렌더링
  if (feedId) {
    try {
      feedData = await getCachedMoment(feedId)
    } catch (e) { console.error('SSR feed error:', e) }
  }

  return (
    <>
      {/* ── SEO Hidden Layer: 봇에게만 읽히고 화면에는 보이지 않는 컨텐츠 ── */}
      {feedData && (
        <article className="sr-only">
          <h1>{t('Metadata.momentRecord', { name: feedData.user?.display_name || t('Common.anonymous') })}</h1>
          <p>{feedData.content}</p>
          <time dateTime={feedData.created_at.toISOString()}>{feedData.created_at.toString()}</time>
        </article>
      )}
    </>
  )
}
