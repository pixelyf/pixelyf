import prisma from '@/shared/lib/prisma'
import { normalizeDmLocale, normalizeDmLocaleList } from '@/shared/lib/dm/messageDisplay'
import { resolveApiKeyByUserId } from './compaction'
import { translateBabelContent } from './babelTranslator'

type UpsertDmMessageTranslationParams = {
  messageId: string
  locale: string
  content: string
  status?: 'completed' | 'failed'
  tokensUsed?: number | null
}

type TranslateDmMessageParams = {
  messageId: string
  content: string
  senderUserId: string
  sourceLanguage: string | null | undefined
  targetLanguages: Array<string | null | undefined>
  timeoutMs?: number
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

export async function upsertDmMessageTranslation(params: UpsertDmMessageTranslationParams) {
  const locale = normalizeDmLocale(params.locale)
  return prisma.dmMessageTranslation.upsert({
    where: { messageId_locale: { messageId: params.messageId, locale } },
    create: {
      messageId: params.messageId,
      locale,
      content: params.content,
      status: params.status || 'completed',
      tokensUsed: params.tokensUsed ?? null,
    },
    update: {
      content: params.content,
      status: params.status || 'completed',
      tokensUsed: params.tokensUsed ?? null,
    },
  })
}

async function markFailedTranslations(messageId: string, targetLanguages: string[]) {
  await Promise.all(
    targetLanguages.map((locale) =>
      upsertDmMessageTranslation({
        messageId,
        locale,
        content: '',
        status: 'failed',
      }),
    ),
  )
}

export async function translateDmMessageForTargets(params: TranslateDmMessageParams) {
  const sourceLanguage = normalizeDmLocale(params.sourceLanguage)
  const targetLanguages = normalizeDmLocaleList(params.targetLanguages)
    .filter((locale) => locale !== sourceLanguage)

  if (!params.content.trim() || targetLanguages.length === 0) {
    return prisma.dmMessageTranslation.findMany({
      where: { messageId: params.messageId },
      orderBy: { locale: 'asc' },
    })
  }

  try {
    const { apiKey, provider } = await resolveApiKeyByUserId(params.senderUserId)
    const result = await withTimeout(
      translateBabelContent({
        fields: { content: params.content },
        sourceLang: sourceLanguage,
        targetLangs: targetLanguages,
        context: 'dm',
        apiKey,
        provider,
        userId: params.senderUserId,
      }),
      params.timeoutMs ?? 3_000,
      'DM Babel translation',
    )

    await Promise.all(
      targetLanguages.map((locale) => {
        const translatedContent = result.translations[locale]?.content?.trim()
        return upsertDmMessageTranslation({
          messageId: params.messageId,
          locale,
          content: translatedContent || '',
          status: translatedContent ? 'completed' : 'failed',
          tokensUsed: result.tokensUsed,
        })
      }),
    )
  } catch (error) {
    console.error('[DM Babel] translation failed:', error)
    await markFailedTranslations(params.messageId, targetLanguages)
  }

  return prisma.dmMessageTranslation.findMany({
    where: { messageId: params.messageId },
    orderBy: { locale: 'asc' },
  })
}
