import { getTranslations } from 'next-intl/server'
import prisma from '@/shared/lib/prisma'

/**
 * 특정 유저의 언어 설정을 DB에서 조회하여 해당 언어의 번역 인스턴스를 반환합니다.
 * 백그라운드 워커(Inngest 등) 환경처럼 Next.js Request Context가 없는 곳에서
 * 서버 사이드 i18n 처리가 필요할 때 사용합니다.
 */
export async function getUserTranslations(userId: string, namespace?: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    })
    const locale = user?.language || 'ko'
    
    const t = await getTranslations({ locale, namespace })
    return { t, locale }
  } catch (error) {
    console.error(`[getUserTranslations] Failed to load translations for user ${userId}:`, error)
    // Fallback to default locale 'ko' on error
    const t = await getTranslations({ locale: 'ko', namespace })
    return { t, locale: 'ko' }
  }
}
