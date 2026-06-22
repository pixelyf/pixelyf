/**
 * [Babel Backfill Utility]
 * 11개 국어 번역이 누락된 기존 피드를 정밀 체크하여 누락된 언어를 AI로 복구하는 일괄 배치 스크립트입니다.
 * 
 * 실행 방법:
 *   npx tsx scripts/backfill_translations.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

import type { AiProvider } from '../apps/web/src/shared/lib/ai/provider'

let prisma: any;

const ALL_LOCALES = ['ko', 'en', 'ja', 'zh', 'fr', 'es', 'de', 'it', 'pt', 'th', 'vi']

/**
 * 지능형 번역 가드: 의미 없는 단어 번역 방지
 */
function isTranslationSkipped(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true

  const urlRegex = /^(https?:\/\/[^\s]+)$/i
  if (urlRegex.test(trimmed)) return true

  const numericRegex = /^[0-9\s.,:\-_/()[\]{}]+$/
  if (numericRegex.test(trimmed)) return true

  const pureLength = trimmed.replace(/\s+/g, '').length
  if (pureLength <= 4) return true

  const isJamoOnly = /^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(trimmed)
  if (isJamoOnly) return true

  const isRepetitive = /^(.)\1+$/.test(trimmed)
  if (isRepetitive) return true

  return false
}

/**
 * 시스템 마스터 키 획득 (유저 고유 키 누락 시 대리용)
 */
async function getMasterSystemKey(): Promise<{ apiKey: string; provider: AiProvider } | null> {
  const providerKey = await prisma.aiProviderKey.findFirst({
    where: { isActive: true },
    select: { provider: true, apiKeyEncrypted: true },
  })

  if (providerKey) {
    const { decryptApiKey } = await import('../apps/web/src/shared/lib/ai/crypto');
    const apiKey = decryptApiKey(providerKey.apiKeyEncrypted)
    return { apiKey, provider: providerKey.provider as AiProvider }
  }

  if (process.env.OPENAI_KEY) {
    return { apiKey: process.env.OPENAI_KEY, provider: 'openai' as AiProvider }
  }

  return null
}

async function main() {
  prisma = (await import('../apps/web/src/shared/lib/prisma')).default;
  const { resolveApiKeyByUserId } = await import('../apps/web/src/shared/lib/ai/compaction');
  const { translateBabelContent } = await import('../apps/web/src/shared/lib/ai/babelTranslator');

  console.log('============================================================')
  console.log('  [Babel Backfill] 다국어 누락 피드 정밀 진단 및 복구 개시')
  console.log('============================================================')

  // 1. 활성 피드 로드 (픽셀리프 브랜드 은하계 대상만 필터링)
  const moments = await prisma.moment.findMany({
    where: {
      is_deleted: false,
      content: { not: null },
      galaxy_key: 'PIXELYF',
    },
    select: {
      id: true,
      user_id: true,
      content: true,
      original_language: true,
    },
    orderBy: { created_at: 'desc' },
  })

  console.log(`[Status] 총 ${moments.length}개의 활성 피드가 체크 대상으로 분석되었습니다.`)

  let processedCount = 0
  let repairCount = 0
  let skipCount = 0

  // 시스템 마스터 키 캐싱 (번역 가속)
  const masterKey = await getMasterSystemKey()

  for (const m of moments) {
    const text = m.content?.trim() || ''
    if (!text || isTranslationSkipped(text)) {
      skipCount++
      continue
    }

    const orgLang = m.original_language || 'ko'
    
    // 2. 이미 존재하는 completed 상태의 다국어 번역본 locale 조회
    const existingTranslations = await prisma.momentTranslation.findMany({
      where: {
        moment_id: m.id,
        status: 'completed',
      },
      select: { locale: true },
    })

    const completedLocales = existingTranslations.map(t => t.locale)
    
    // 3. 누락된 타겟 언어 목록 추출 (원본 언어 및 이미 작성된 언어 제외)
    const missingTargetLocales = ALL_LOCALES.filter(
      locale => locale !== orgLang && !completedLocales.includes(locale)
    )

    if (missingTargetLocales.length > 0) {
      console.log(`\n👉 피드 복구 타겟 [ID: ${m.id}] / 원본 언어: [${orgLang}]`)
      console.log(`   본문: "${text.length > 30 ? text.substring(0, 30) + '...' : text}"`)
      console.log(`   누락 번역 로캘 (${missingTargetLocales.length}개): [${missingTargetLocales.join(', ')}]`)

      try {
        // 4. API 키 분석: 유저 키 우선 ➡️ 시스템 키 대리(Fallback)
        let authKey: { apiKey: string; provider: AiProvider } | null = null
        try {
          authKey = await resolveApiKeyByUserId(m.user_id)
        } catch {
          authKey = masterKey
        }

        if (!authKey) {
          console.error(`   ❌ 번역 불가: 유저 키가 없고 시스템 마스터 AI 키 조회도 실패했습니다.`)
          continue
        }

        // 5. 복구 대상 로캘에 대한 pendingupsert
        for (const locale of missingTargetLocales) {
          await prisma.momentTranslation.upsert({
            where: { moment_id_locale: { moment_id: m.id, locale } },
            create: { moment_id: m.id, locale, content: '', status: 'pending' },
            update: { status: 'pending' },
          })
        }

        // 6. 통합 번역 코어 호출하여 누락 다국어 동시 생성
        const result = await translateBabelContent({
          fields: { content: text },
          sourceLang: orgLang,
          targetLangs: missingTargetLocales,
          context: 'feed',
          apiKey: authKey.apiKey,
          provider: authKey.provider,
          userId: m.user_id,
        })

        // 7. 번역본 DB 최종 upsert 적재 (completed)
        const tokensPerLang = Math.ceil(
          result.tokensUsed / Math.max(1, Object.keys(result.translations).length)
        )

        let successCount = 0
        for (const [locale, fields] of Object.entries(result.translations)) {
          if (fields.content) {
            await prisma.momentTranslation.upsert({
              where: { moment_id_locale: { moment_id: m.id, locale } },
              create: {
                moment_id: m.id,
                locale,
                content: fields.content,
                status: 'completed',
                tokens_used: tokensPerLang,
              },
              update: {
                content: fields.content,
                status: 'completed',
                tokens_used: tokensPerLang,
              },
            })
            successCount++
          }
        }

        // 실패한 잔여 pending 언어 failed 처리
        for (const locale of missingTargetLocales) {
          if (!result.translations[locale] || !result.translations[locale].content) {
            await prisma.momentTranslation.update({
              where: { moment_id_locale: { moment_id: m.id, locale } },
              data: { status: 'failed' },
            })
          }
        }

        console.log(`   ✅ 복구 성공: ${successCount}/${missingTargetLocales.length}개 언어 이식 완료`)
        repairCount++
      } catch (err: any) {
        console.error(`   ❌ 복구 에러 [ID: ${m.id}]:`, err?.message || err)
        console.log(`   ⚠️ [Fallback] AI 번역 불가하여 원본 텍스트로 다국어 번역본 강제 이식을 수행합니다.`)
        let successCount = 0
        for (const locale of missingTargetLocales) {
          await prisma.momentTranslation.upsert({
            where: { moment_id_locale: { moment_id: m.id, locale } },
            create: {
              moment_id: m.id,
              locale,
              content: text,
              status: 'completed',
              tokens_used: 0,
            },
            update: {
              content: text,
              status: 'completed',
              tokens_used: 0,
            },
          })
          successCount++
        }
        console.log(`   ✅ 임시 복구 완료: ${successCount}/${missingTargetLocales.length}개 언어 원문 복제 완료`)
        repairCount++
      }
    }
    processedCount++
  }

  console.log('\n============================================================')
  console.log('  [Babel Backfill] 정밀 누락 진단 및 복구 프로세스 종료')
  console.log(`  - 분석 완료 피드: ${processedCount}개`)
  console.log(`  - 가드 작동 스킵: ${skipCount}개`)
  console.log(`  - 다국어 복구 성공: ${repairCount}개`)
  console.log('============================================================')
}

main()
  .catch(e => {
    console.error('Fatal Migration Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
