export const DEFAULT_DM_LOCALE = 'ko'

export const SUPPORTED_DM_LOCALES = [
  'ko',
  'en',
  'ja',
  'zh',
  'fr',
  'es',
  'de',
  'pt',
  'it',
  'th',
  'vi',
] as const

type SegmenterConstructor = new (
  locale?: string,
  options?: { granularity?: 'grapheme' },
) => {
  segment(input: string): Iterable<{ segment: string }>
}

export type DmTranslationStatus = 'original' | 'completed' | 'failed' | 'pending'

export type DmTranslationRecord = {
  locale: string | null
  content: string | null
  status: string | null
  tokensUsed?: number | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

export type DmTranslationPayload = {
  locale: string
  content: string
  status: string
  tokensUsed: number | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type DmDisplayFields = {
  displayContent: string
  displayLanguage: string
  translationStatus: DmTranslationStatus
  translations: DmTranslationPayload[]
}

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_DM_LOCALES)

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

export function normalizeDmLocale(locale: string | null | undefined): string {
  const normalized = (locale || DEFAULT_DM_LOCALE).trim().toLowerCase().replace('_', '-')
  if (!normalized) return DEFAULT_DM_LOCALE

  const baseLocale = normalized.split('-')[0]
  if (baseLocale === 'zh') return 'zh'
  return SUPPORTED_LOCALE_SET.has(baseLocale) ? baseLocale : DEFAULT_DM_LOCALE
}

export function normalizeDmLocaleList(locales: Array<string | null | undefined>): string[] {
  return Array.from(new Set(locales.map(normalizeDmLocale)))
}

export function truncateDmPreview(content: string, maxLength = 100): string {
  const text = content.trim()
  if (text.length <= maxLength) return text

  const IntlWithSegmenter = Intl as typeof Intl & { Segmenter?: SegmenterConstructor }
  if (IntlWithSegmenter.Segmenter) {
    const segmenter = new IntlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
    const pieces: string[] = []
    for (const item of segmenter.segment(text)) {
      if (pieces.length >= maxLength) break
      pieces.push(item.segment)
    }
    return pieces.join('')
  }

  return Array.from(text).slice(0, maxLength).join('')
}

export function serializeDmTranslations(
  translations: DmTranslationRecord[] | null | undefined,
): DmTranslationPayload[] {
  if (!translations?.length) return []

  return translations.map((translation) => ({
    locale: normalizeDmLocale(translation.locale),
    content: translation.content || '',
    status: translation.status || 'completed',
    tokensUsed: translation.tokensUsed ?? null,
    createdAt: toIsoString(translation.createdAt),
    updatedAt: toIsoString(translation.updatedAt),
  }))
}

export function getDmDisplayFields(
  content: string,
  translations: DmTranslationRecord[] | null | undefined,
  viewerLocale: string | null | undefined,
): DmDisplayFields {
  const displayLanguage = normalizeDmLocale(viewerLocale)
  const serializedTranslations = serializeDmTranslations(translations)
  const matchedTranslation = serializedTranslations.find(
    (translation) => translation.locale === displayLanguage,
  )

  if (matchedTranslation?.status === 'completed' && matchedTranslation.content.trim()) {
    return {
      displayContent: matchedTranslation.content,
      displayLanguage,
      translationStatus: 'completed',
      translations: serializedTranslations,
    }
  }

  return {
    displayContent: content,
    displayLanguage,
    translationStatus: matchedTranslation?.status === 'failed' ? 'failed' : 'original',
    translations: serializedTranslations,
  }
}

export function attachDmDisplayFields<T extends { content: string; translations?: DmTranslationRecord[] | null }>(
  message: T,
  viewerLocale: string | null | undefined,
): T & DmDisplayFields & { originalContent: string } {
  const displayFields = getDmDisplayFields(message.content, message.translations, viewerLocale)
  return {
    ...message,
    ...displayFields,
    originalContent: message.content,
  }
}
