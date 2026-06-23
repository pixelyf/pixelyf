import { Metadata, ResolvingMetadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getCachedMoment, getCachedUser } from '@/shared/lib/queries'

type Props = {
  params: Promise<{ locale: string }>
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

export default async function RootGalaxyPage({ params, searchParams }: Props) {
  const { locale } = await params
  const t = await getTranslations()
  const sparams = await searchParams;
  const feedId = typeof sparams.feed === 'string' ? sparams.feed : undefined;
  let feedData = null;

  // [SEO] 구글봇(Googlebot) 검색 수집을 위한 백그라운드 SSR 렌더링
  if (feedId) {
    try {
      feedData = await getCachedMoment(feedId)
    } catch (e) { console.error('SSR feed error:', e) }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pixelyf.com'

  // [GEO] 생성형 검색엔진(AEO/GEO) 최적화를 위한 SoftwareApplication 스키마 동적 정의
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl}/#software`,
    name: locale === 'ko' ? '픽셀리프' : 'Pixelyf',
    alternateName: locale === 'ko' ? 'Pixelyf' : '픽셀리프',
    url: siteUrl,
    applicationCategory: 'SocialNetworkingApplication, ProductivityApplication',
    applicationSubCategory: 'Artificial Intelligence Social Platform',
    operatingSystem: 'All',
    description: locale === 'ko'
      ? '사용자의 생각 모먼트를 시맨틱 임베딩 기반의 2D 인터랙티브 픽셀로 변환하여 시각화하고 공유하는 오픈 소스 지식 플랫폼입니다. 기억을 학습하는 나만의 AI 아바타(The Soul)를 통해 소통하고 기록해 보세요.'
      : 'An open-source knowledge platform that visualizes and shares users\' thought moments by converting them into 2D interactive pixels based on semantic embedding. Create your personal AI avatar (The Soul) that learns your memories.',
    featureList: locale === 'ko'
      ? [
          "시맨틱 임베딩 기반의 생각 시각화",
          "2D 인터랙티브 픽셀 매핑",
          "기억 학습형 개인 AI 아바타(The Soul) 및 다국어 소통"
        ]
      : [
          "Thought visualization using semantic embedding",
          "2D interactive pixel mapping",
          "AI avatar (The Soul) personalization & multilingual communication"
        ],
    codeRepository: "https://github.com/pixelyf",
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'KRW',
    },
    author: {
      '@type': 'Organization',
      name: 'Pixelyf Team',
      url: siteUrl,
    },
  }

  return (
    <>
      {/* ─── [GEO] JSON-LD 구조화 데이터 주입 ─────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── SEO Hidden Layer: 봇에게만 읽히고 화면에는 보이지 않는 컨텐츠 ── */}
      {feedData ? (
        <article className="sr-only">
          <h1>{t('Metadata.momentRecord', { name: feedData.user?.display_name || t('Common.anonymous') })}</h1>
          <p>{feedData.content}</p>
          <time dateTime={feedData.created_at.toISOString()}>{feedData.created_at.toString()}</time>
        </article>
      ) : (
        <article className="sr-only">
          {/* 홈 페이지 전용 AEO/GEO 데이터 레이어 */}
          <h1>{t('Metadata.aeoTitle')}</h1>
          <p>{t('Metadata.aeoDescription')}</p>
          <p>{t('Metadata.aeoSoulDescription')}</p>
          <p>{t('Metadata.aeoOpenSource')}</p>
        </article>
      )}
    </>
  )
}
