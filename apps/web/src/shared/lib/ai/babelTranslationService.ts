/**
 * [Babel Translation Service]
 * 픽셀리프 다국어 동기식 번역 및 RDB 즉각 적재 서비스 레이어.
 * 카테고리 및 유저 프로필 등 실시간 성격의 다국어 처리를 안전하게 일원화 제어합니다.
 */

import prisma from '@/shared/lib/prisma'
import { translateBabelContent } from './babelTranslator'
import { resolveApiKeyByUserId } from './compaction'
import { SUPPORTED_LOCALES } from '@/i18n/routing'

export class BabelTranslationService {
  /**
   * [실시간 동기화] 카테고리 등록/수정 시 즉각 BFP 가동 및 DB upsert 적재
   * (비치명적 격리 설계: 번역 엔진 오류가 발생하더라도 카테고리 본체 저장을 실패시키지 않음)
   */
  static async translateAndSaveCategory(params: {
    categoryId: string
    name: string
    description?: string
    adminUserId: string
  }): Promise<boolean> {
    const { categoryId, name, description, adminUserId } = params
    const defaultLangs = [...SUPPORTED_LOCALES]

    try {
      // 1. 어드민 사용자 API 키 조회
      const { apiKey, provider } = await resolveApiKeyByUserId(adminUserId)

      // 2. 통합 다국어 번역 코어 호출 (Category Context)
      const result = await translateBabelContent({
        fields: {
          name,
          description: description || '',
        },
        sourceLang: 'ko', // 어드민 카테고리 기본 생성 언어
        targetLangs: defaultLangs,
        context: 'category',
        apiKey,
        provider,
        userId: adminUserId,
      })

      // 3. DB Category Translation 일괄 Upsert
      const upsertPromises = Object.entries(result.translations).map(([locale, fields]) => {
        return prisma.galaxyCategoryTranslation.upsert({
          where: {
            category_id_locale: {
              category_id: categoryId,
              locale,
            },
          },
          create: {
            category_id: categoryId,
            locale,
            name: fields.name || name,
            description: fields.description || null,
          },
          update: {
            name: fields.name || name,
            description: fields.description || null,
          },
        })
      })

      await Promise.all(upsertPromises)
      console.log(`[BabelTranslationService] 카테고리 다국어 실시간 적재 성공 (ID: ${categoryId})`)
      return true
    } catch (err: any) {
      console.error(
        `[BabelTranslationService] 카테고리 다국어 번역 실패 (Non-critical):`,
        err?.message || err
      )
      return false
    }
  }

  /**
   * [실시간 동기화] 유저 프로필 상태 메시지 수정 시 즉각 BFP 가동 및 DB upsert 적재
   */
  static async translateAndSaveProfile(params: {
    userId: string
    statusMessage: string
    sourceLang: string
  }): Promise<boolean> {
    const { userId, statusMessage, sourceLang } = params
    const defaultLangs = [...SUPPORTED_LOCALES]

    if (!statusMessage?.trim()) return true

    try {
      // 1. 사용자 API 키 조회
      const { apiKey, provider } = await resolveApiKeyByUserId(userId)

      // 2. 통합 다국어 번역 코어 호출 (Profile Context)
      const result = await translateBabelContent({
        fields: {
          status_message: statusMessage,
        },
        sourceLang,
        targetLangs: defaultLangs.filter((l) => l !== sourceLang), // 원글 언어 제외
        context: 'profile',
        apiKey,
        provider,
        userId,
      })

      // 3. 원글 언어도 보존 저장 (클라이언트 렌더링 편의를 위함)
      const translationsMap = {
        ...result.translations,
        [sourceLang]: { status_message: statusMessage },
      }

      // 4. DB Profile Translation 일괄 Upsert
      const upsertPromises = Object.entries(translationsMap).map(([locale, fields]) => {
        return prisma.userProfileTranslation.upsert({
          where: {
            user_id_locale: {
              user_id: userId,
              locale,
            },
          },
          create: {
            user_id: userId,
            locale,
            status_message: fields.status_message || statusMessage,
          },
          update: {
            status_message: fields.status_message || statusMessage,
          },
        })
      })

      await Promise.all(upsertPromises)
      console.log(`[BabelTranslationService] 프로필 상태메시지 다국어 실시간 적재 성공 (User: ${userId})`)
      return true
    } catch (err: any) {
      console.error(
        `[BabelTranslationService] 프로필 다국어 번역 실패 (Non-critical):`,
        err?.message || err
      )
      return false
    }
  }
}
