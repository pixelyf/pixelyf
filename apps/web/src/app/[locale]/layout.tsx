import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale, getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { UserProvider } from "@/entities/user/ui/UserProvider";
import { GlobalToast } from "@/shared/ui/GlobalToast";
import { GalaxyDialogProvider } from "@/shared/ui/GalaxyDialogProvider";
import { PingListener } from "@/shared/ui/PingListener";
import { getCurrentUser } from "@/shared/lib/auth/getCurrentUser";
import Script from "next/script";

if (process.env.NODE_ENV === 'production') {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  console.debug = noop;
}


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Metadata");
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pixelyf.com';
  const isDevSite = siteUrl.includes('dev.pixelyf.com') || process.env.NEXT_PUBLIC_APP_ENV === 'development';
  const isProd = process.env.NODE_ENV === 'production' && !isDevSite;

  const prefix = locale === 'ko' ? '' : `/${locale}`;
  const canonicalUrl = `${siteUrl}${prefix}`;

  const openGraphLocales: Record<string, string> = {
    ko: 'ko_KR',
    en: 'en_US',
    ja: 'ja_JP',
    zh: 'zh_CN',
    es: 'es_ES',
    fr: 'fr_FR',
    de: 'de_DE',
    pt: 'pt_PT',
    it: 'it_IT',
    vi: 'vi_VN',
    th: 'th_TH',
  };
  const ogLocale = openGraphLocales[locale] || 'ko_KR';

  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/logo-dark.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: [
        { url: '/logo-dark.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    robots: {
      index: isProd,
      follow: isProd,
      googleBot: {
        index: isProd,
        follow: isProd,
      },
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ko': `${siteUrl}`,
        'en': `${siteUrl}/en`,
        'ja': `${siteUrl}/ja`,
        'zh': `${siteUrl}/zh`,
        'es': `${siteUrl}/es`,
        'fr': `${siteUrl}/fr`,
        'de': `${siteUrl}/de`,
        'pt': `${siteUrl}/pt`,
        'it': `${siteUrl}/it`,
        'vi': `${siteUrl}/vi`,
        'th': `${siteUrl}/th`,
      }
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: canonicalUrl,
      siteName: 'Pixelyf',
      images: [
        {
          url: `${siteUrl}/logo.png`,
          width: 1200,
          height: 630,
          alt: t("ogImageAlt") || 'Pixelyf Logo',
        },
      ],
      locale: ogLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t("title"),
      description: t("description"),
      images: [`${siteUrl}/logo.png`],
    },
    verification: {
      other: {
        'naver-site-verification': [
          process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION || 'f54c33d4e0e5670c57173b22b10a26ba',
        ],
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  modal,
  params,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  // [서버 컴포넌트] SSR 시점에 유저 세션 조회 → 클라이언트 fetch 없이 즉시 주입
  const initialUser = await getCurrentUser();
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  var noop = function() {};
                  var methods = ['log', 'debug', 'info', 'warn', 'error', 'dir', 'table', 'trace', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd'];
                  if (!window.console) window.console = {};
                  for (var i = 0; i < methods.length; i++) {
                    window.console[methods[i]] = noop;
                  }
                })();
              `,
            }}
          />
        )}
        {/* Google Analytics */}
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-[#020617] text-slate-200">
        <NextIntlClientProvider messages={messages}>
          <UserProvider initialUser={initialUser}>
            <PingListener />
            <GlobalToast />
            <GalaxyDialogProvider />
            {children}
            {modal}
          </UserProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
