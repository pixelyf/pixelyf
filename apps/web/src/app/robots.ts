import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pixelyf.com'
  const isDevSite = baseUrl.includes('dev.pixelyf.com') || process.env.NEXT_PUBLIC_APP_ENV === 'development'
  const isProd = process.env.NODE_ENV === 'production' && !isDevSite

  if (!isProd) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/settings/', '/my-galaxy/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

