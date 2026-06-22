import { defineRouting } from 'next-intl/routing'

export const SUPPORTED_LOCALES = ['ko', 'en', 'ja', 'zh', 'es', 'fr', 'de', 'pt', 'it', 'vi', 'th'] as const
export type Locale = typeof SUPPORTED_LOCALES[number]

export const LANGUAGE_LABELS: Record<string, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '简体中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  vi: 'Tiếng Việt',
  th: 'ภาษาไทย'
}

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: 'ko',
  localePrefix: 'as-needed', // ko는 prefix 생략, 나머지는 /en/, /ja/ 등
  localeDetection: false // 브라우저 언어/쿠키 기반 자동 리다이렉트 완전 차단
})
