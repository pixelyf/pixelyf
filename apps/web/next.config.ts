import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  allowedDevOrigins: ['172.30.1.56', '172.30.1.60', '127.0.0.1', 'localhost', '172.30.1.52', '172.30.1.64'],
  serverExternalPackages: ['@prisma/client', 'pg'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
      },
      {
        protocol: 'https',
        hostname: 'raw.communitydragon.org',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/supabase/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/api/proxy/ddragon/:path*',
        destination: 'https://ddragon.leagueoflegends.com/:path*',
      },
      {
        source: '/api/proxy/communitydragon/:path*',
        destination: 'https://raw.communitydragon.org/:path*',
      },
      {
        source: '/supabase/:path*',
        destination: process.env.NEXT_PUBLIC_SUPABASE_URL
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/:path*`
          : (process.env.NODE_ENV === 'production'
            ? 'http://127.0.0.1:8082/:path*'
            : 'https://api.pixelyf.com/:path*'),
      },
    ];
  },
};

export default withNextIntl(nextConfig)
