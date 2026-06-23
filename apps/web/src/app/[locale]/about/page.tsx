import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import BrandShowroom from './BrandShowroom'

type Props = {
  params: Promise<{ locale: string }>
}

/**
 * [GEO/SEO] 브랜드 페이지 전용 메타데이터
 * - locale별 다국어 title/description 동적 생성
 * - openGraph, twitter, keywords 완전 분리 설정
 * - 구글 AI Overviews, Perplexity 등 생성형 검색엔진 최적화
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'BrandMeta' })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pixelyf.com'
  const isDevSite = siteUrl.includes('dev.pixelyf.com') || process.env.NEXT_PUBLIC_APP_ENV === 'development'
  const isProd = process.env.NODE_ENV === 'production' && !isDevSite

  const prefix = locale === 'ko' ? '' : `/${locale}`
  const canonicalUrl = `${siteUrl}${prefix}/about`

  const openGraphLocales: Record<string, string> = {
    ko: 'ko_KR', en: 'en_US', ja: 'ja_JP', zh: 'zh_CN',
    es: 'es_ES', fr: 'fr_FR', de: 'de_DE', pt: 'pt_PT',
    it: 'it_IT', vi: 'vi_VN', th: 'th_TH',
  }
  const ogLocale = openGraphLocales[locale] || 'ko_KR'

  return {
    title: t('title'),
    description: t('description'),
    keywords: t('keywords'),
    robots: {
      index: isProd,
      follow: isProd,
      googleBot: { index: isProd, follow: isProd },
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ko': `${siteUrl}/about`,
        'en': `${siteUrl}/en/about`,
        'ja': `${siteUrl}/ja/about`,
        'zh': `${siteUrl}/zh/about`,
        'es': `${siteUrl}/es/about`,
        'fr': `${siteUrl}/fr/about`,
        'de': `${siteUrl}/de/about`,
        'pt': `${siteUrl}/pt/about`,
        'it': `${siteUrl}/it/about`,
        'vi': `${siteUrl}/vi/about`,
        'th': `${siteUrl}/th/about`,
      }
    },
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: canonicalUrl,
      siteName: 'Pixelyf',
      images: [
        {
          url: `${siteUrl}/og-brand.png`,
          width: 1200,
          height: 630,
          alt: t('ogImageAlt'),
        },
      ],
      locale: ogLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('twitterTitle'),
      description: t('twitterDescription'),
      images: [`${siteUrl}/og-brand.png`],
    },
  }
}

export default async function AboutShowroomPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pixelyf.com'
  const prefix = locale === 'ko' ? '' : `/${locale}`

  const t = await getTranslations({ locale, namespace: 'Brand' })
  const tFaq = await getTranslations({ locale, namespace: 'Faq' })

  // A helper to safely retrieve Brand translation keys with fallback
  const getTranslationWithFallback = (key: string, defaultText: string) => {
    try {
      const val = t(key)
      if (val && val !== key) return val
    } catch (e) {}
    return defaultText
  }

  // A helper to safely retrieve Faq translation keys with fallback
  const getFaqWithFallback = (key: string, defaultText: string) => {
    try {
      const val = tFaq(key)
      if (val && val !== key) return val
    } catch (e) {}
    return defaultText
  }

  // ─── [GEO] JSON-LD 구조화 데이터 ────────────────────────────────────────
  // Google AI Overviews, Perplexity, ChatGPT Search 등 생성형 검색엔진이
  // 픽셀리프를 'AI 소셜 플랫폼 소프트웨어'로 정확하게 인식하도록 합니다.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      // 1) 서비스 전체 엔티티 정의 (SoftwareApplication)
      {
        '@type': 'SoftwareApplication',
        '@id': `${siteUrl}/#software`,
        name: locale === 'ko' ? '픽셀리프' : 'Pixelyf',
        alternateName: locale === 'ko' ? 'Pixelyf' : '픽셀리프',
        url: siteUrl,
        applicationCategory: 'SocialNetworkingApplication, ProductivityApplication',
        applicationSubCategory: 'Artificial Intelligence Social Platform',
        operatingSystem: 'All',
        description: locale === 'ko'
          ? '사용자의 일상 기록과 가치관을 AI가 학습하여 개인 고유의 디지털 분신(AI 아바타, The Soul)을 구축하고, 전 세계 사용자들과 언어 장벽 없이 깊은 공명을 나누는 생각 중심의 차세대 소셜 미디어 플랫폼'
          : 'Pixelyf is a next-generation mind-centric social platform where AI learns your daily records and values to build a personal digital avatar (The Soul), enabling borderless resonance with users worldwide.',
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
          name: 'Pixelyf',
          url: siteUrl,
        },
      },
      // 2) 브랜드 웹페이지 정의 (WebPage)
      {
        '@type': 'WebPage',
        '@id': `${siteUrl}${prefix}/about#webpage`,
        url: `${siteUrl}${prefix}/about`,
        name: locale === 'ko'
          ? '픽셀리프 소개 | 23.5도의 철학 & AI 아바타 기술'
          : 'About Pixelyf | The Philosophy of 23.5° & AI Avatar Technology',
        description: locale === 'ko'
          ? '픽셀(Pixel)과 삶(Life)이 결합된 픽셀리프의 브랜드 세계관 — 23.5도의 기울어진 프레임, 시맨틱 임베딩 기반의 2D 픽셀 맵, The Soul AI 아바타 기술, 그리고 디지털 영혼이 연결되는 오픈소스 지식 플랫폼을 소개합니다.'
          : "Discover Pixelyf's universe — the philosophy of 23.5°, semantic embedding-based 2D pixel mapping, The Soul AI avatar technology, and the open-source knowledge platform connecting digital souls globally.",
        isPartOf: {
          '@type': 'WebSite',
          '@id': `${siteUrl}/#website`,
          name: 'Pixelyf',
          url: siteUrl,
        },
        about: { '@id': `${siteUrl}/#software` },
        inLanguage: locale,
      },
      // 3) FAQ 구조화 데이터 (FAQPage) — Google 리치 결과 + AI 인용 극대화
      {
        '@type': 'FAQPage',
        '@id': `${siteUrl}${prefix}/about#faqpage`,
        mainEntity: [
          {
            '@type': 'Question',
            name: getFaqWithFallback('q1', locale === 'ko' ? '픽셀리프(Pixelyf)는 어떤 플랫폼인가요?' : 'What is Pixelyf?'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: getFaqWithFallback('a1', locale === 'ko' 
                ? '픽셀리프(Pixelyf)는 사용자의 일상 기록, 생각, 가치관을 AI가 학습하여 개인 고유의 디지털 분신(AI 아바타, The Soul)을 만드는 생각 중심의 차세대 소셜 플랫폼입니다. 단순한 사진 공유를 넘어 개인의 깊은 내면세계를 기록하고, 전 세계 사용자들과 영혼의 공명을 나눌 수 있는 독창적인 공간을 지향합니다.'
                : 'Pixelyf is a next-generation mind-centric social platform where AI learns your daily records, thoughts, and values to create a unique personal digital avatar (The Soul). It goes beyond simple photo sharing, offering a space to record your inner world and resonate deeply with others worldwide.'
              ),
            },
          },
          {
            '@type': 'Question',
            name: getFaqWithFallback('q2', locale === 'ko' ? "픽셀리프의 'The Soul' AI 아바타는 어떻게 작동하나요?" : "How does Pixelyf's 'The Soul' AI avatar work?"),
            acceptedAnswer: {
              '@type': 'Answer',
              text: getFaqWithFallback('a2', locale === 'ko'
                ? "픽셀리프의 'The Soul'은 사용자가 남기는 일상 기록, 관심사, 가치관을 안전하게 누적하여 동기화(Synchronization)하는 개인 AI 엔진입니다. 학습된 AI 아바타는 사용자가 잠든 시간에도 플랫폼 내에서 나와 깊은 파동(생각과 가치관)을 공유하는 다른 픽셀리어를 스스로 찾아가 연결합니다."
                : "Pixelyf's 'The Soul' is a personal AI engine that safely accumulates and synchronizes the user's daily records, interests, and values. The trained AI avatar autonomously seeks out and connects with other Pixeliers who share deep wavelengths — even while you sleep."
              ),
            },
          },
          {
            '@type': 'Question',
            name: getFaqWithFallback('q3', locale === 'ko' ? "브랜드의 '23.5도'는 무엇을 의미하나요?" : "What does the brand's '23.5 degrees' symbolize?"),
            acceptedAnswer: {
              '@type': 'Answer',
              text: getFaqWithFallback('a3', locale === 'ko'
                ? '지구의 자전축이 23.5도 기울어져 사계절이라는 생동감 있는 변화를 만들어내듯, 픽셀리프는 기울어진 23.5도의 프레임을 통해 세상을 바라보는 새로운 관점을 상징합니다. 정형화된 시선에서 벗어나 나만의 방식으로 우주와 일상을 기록할 때, 삶은 더욱 확장되고 연결됩니다.'
                : "Just as Earth's axial tilt of 23.5° creates the vibrant changes of four seasons, Pixelyf's 23.5° frame symbolizes a fresh perspective on the world. When you step outside the rigid frame and record your universe in your own way, life expands and connects in new dimensions."
              ),
            },
          },
          {
            '@type': 'Question',
            name: getFaqWithFallback('q4', locale === 'ko' ? '픽셀리프는 기존 SNS와 어떻게 다른가요?' : 'How is Pixelyf different from other social media?'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: getFaqWithFallback('a4', locale === 'ko'
                ? '기존 SNS가 타인에게 보여주기 위한 시각적 이미지 중심이라면, 픽셀리프는 나의 내면과 생각을 기록하는 본질 중심의 플랫폼입니다. 내가 직접 관계를 찾아 헤매지 않아도 나를 학습한 개인 AI 아바타(The Soul)가 내면의 주파수가 맞는 진정한 연결을 대신 찾아줍니다.'
                : 'While existing social networks are image-centric and focused on showing off to others, Pixelyf is an essence-first platform for recording your inner self. Your personal AI avatar (The Soul) finds genuine connections that resonate with your inner frequency — without you having to search.'
              ),
            },
          },
          {
            '@type': 'Question',
            name: getFaqWithFallback('q5', locale === 'ko' ? '개인 데이터와 기억들은 안전하게 보호되나요?' : 'Is my personal data and memories protected?'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: getFaqWithFallback('a5', locale === 'ko'
                ? '네, 픽셀리프는 사용자의 소중한 기억과 데이터를 철저히 보호합니다. AI 학습에 사용되는 모든 개인 데이터는 암호화되어 관리되며, 사용자의 동의 없이 외부에 공유되거나 오용되지 않습니다.'
                : 'Yes, Pixelyf is committed to protecting your precious memories and data. All personal data used for AI learning is encrypted and managed, and is never shared externally or misused without your consent.'
              ),
            },
          },
        ],
      },
    ],
  }

  return (
    <>
      {/* ─── [GEO] JSON-LD 구조화 데이터 주입 ─────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ─── [GEO] SEO 은닉 레이어: 크롤러가 읽는 구조적 텍스트 ──────────────
           화면에는 보이지 않지만 검색엔진 봇에게 핵심 정보를 직접 전달합니다.
           기존 UI/UX에는 아무런 영향을 주지 않습니다.
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="sr-only" aria-hidden="true">
        <h1>{getTranslationWithFallback('namingTitle', locale === 'ko' ? '픽셀리프(Pixelyf) 서비스 소개' : 'About Pixelyf')}</h1>
        <p>{getTranslationWithFallback('namingDesc1', '')} {getTranslationWithFallback('namingDesc2', '')}</p>
        
        <section>
          <h2>{getTranslationWithFallback('frameTitle', locale === 'ko' ? '서비스 철학 — 23.5도의 의미' : 'Brand Philosophy — The 23.5° Meaning')}</h2>
          <p>{getTranslationWithFallback('frameDesc1', '')}</p>
          <p>{getTranslationWithFallback('frameDesc2', '')}</p>
        </section>

        <section>
          <h2>{getTranslationWithFallback('soulTitle', locale === 'ko' ? 'The Soul — AI 아바타 기술' : 'The Soul — AI Avatar Technology')}</h2>
          <p>{getTranslationWithFallback('soulDesc1', '')}</p>
          <p>{getTranslationWithFallback('soulDesc2', '')}</p>
          <p>{getTranslationWithFallback('soulDesc3', '')}</p>
        </section>
      </div>

      {/* ─── 기존 클라이언트 UI (애니메이션, 인터랙션 완전 보존) ───────────── */}
      <BrandShowroom />
    </>
  )
}
