/**
 * [Babel Shared Translation Workers]
 * Inngest 비동기 워커 대통합.
 * 피드와 댓글의 비동기 다국어 생성을 공통 번역 코어를 통해 안전하고 정밀하게 처리합니다.
 *
 * 제공 함수:
 * - feedTranslationFunction (피드 번역)
 * - commentTranslationFunction (댓글 번역)
 */

import { inngest } from "@/lib/inngest"
import prisma from "@/shared/lib/prisma"
import { resolveApiKeyByUserId } from "@/shared/lib/ai/compaction"
import { translateBabelContent } from "@/shared/lib/ai/babelTranslator"

// ─── 1. 인간 피드(Moment) 비동기 번역 워커 ───────────────────

export const feedTranslationFunction = inngest.createFunction(
  {
    id: "feed-translation",
    retries: 3, // 429 Rate Limit 자동 재시도
    triggers: [{ event: "feed/translation.requested" as const }],
  },
  async ({ event }) => {
    const { momentId, userId, content, sourceLang, targetLangs } = event.data as {
      momentId: string
      userId: string
      content: string
      sourceLang: string
      targetLangs: string[]
    }

    if (!targetLangs || targetLangs.length === 0) {
      return { status: "skipped", reason: "no target languages" }
    }

    // 0. Race Condition 방어: moment가 실제로 DB에 쓰여질 때까지 최대 3초간 대기 (500ms 간격 폴링)
    let momentExists = false
    for (let i = 0; i < 6; i++) {
      const moment = await prisma.moment.findUnique({
        where: { id: momentId },
        select: { id: true }
      })
      if (moment) {
        momentExists = true
        break
      }
      console.log(`[FeedTranslation] Moment ${momentId}를 DB에서 찾는 중... 재시도 (${i + 1}/6)`)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    if (!momentExists) {
      console.error(`[FeedTranslation Failed] Moment ${momentId}가 DB에 존재하지 않습니다.`)
      throw new Error(`[Transient Error] Moment ${momentId} not found in database yet. Retrying...`)
    }

    // 1. pending 레코드 생성
    for (const locale of targetLangs) {
      await prisma.momentTranslation.upsert({
        where: { moment_id_locale: { moment_id: momentId, locale } },
        create: {
          moment_id: momentId,
          locale,
          content: "",
          status: "pending",
        },
        update: {
          status: "pending",
        },
      })
    }

    try {
      // 2. API 키 조회
      const { apiKey, provider } = await resolveApiKeyByUserId(userId)

      // 3. 통합 번역 코어 호출 (Feed Context)
      const result = await translateBabelContent({
        fields: { content },
        sourceLang,
        targetLangs,
        context: "feed",
        apiKey,
        provider,
        userId,
      })

      // 4. 성공한 번역 저장
      const tokensPerLang = Math.ceil(
        result.tokensUsed / Math.max(1, Object.keys(result.translations).length)
      )

      let completedCount = 0
      for (const [locale, fields] of Object.entries(result.translations)) {
        if (fields.content) {
          await prisma.momentTranslation.upsert({
            where: { moment_id_locale: { moment_id: momentId, locale } },
            create: {
              moment_id: momentId,
              locale,
              content: fields.content,
              status: "completed",
              tokens_used: tokensPerLang,
            },
            update: {
              content: fields.content,
              status: "completed",
              tokens_used: tokensPerLang,
            },
          })
          completedCount++
        }
      }

      // 5. 누락/실패 언어 처리
      for (const locale of targetLangs) {
        if (!result.translations[locale] || !result.translations[locale].content) {
          await prisma.momentTranslation.update({
            where: { moment_id_locale: { moment_id: momentId, locale } },
            data: { status: "failed" },
          })
        }
      }

      console.log(
        `[FeedTranslation] 완료: momentId=${momentId}, ${completedCount}/${targetLangs.length} 언어 완료`
      )
      return {
        status: "completed",
        completedCount,
        totalLangs: targetLangs.length,
      }
    } catch (err: any) {
      console.error(`[FeedTranslation] 실패: momentId=${momentId}`, err?.message)
      await prisma.momentTranslation.updateMany({
        where: { moment_id: momentId, status: "pending" },
        data: { status: "failed" },
      })

      // [Babel Feed] API 키 누락 또는 복호화 에러 발생 시, Inngest 재시도 없이 번역을 즉시 패스(스킵)합니다.
      const isMissingKeyError = err?.message?.includes("[resolveApiKeyByUserId Error]") || 
                                err?.message?.includes("[resolveApiKeyByUserId Decryption Error]")
      if (isMissingKeyError) {
        console.warn(`[FeedTranslation Skipped] API 키가 유효하지 않아 번역을 생략(스킵)합니다: momentId=${momentId}`)
        return { status: "skipped", reason: "no valid api key" }
      }

      throw err // Inngest 재시도 유발
    }
  }
)

// ─── 2. 피드 댓글(MomentComment) 비동기 번역 워커 ─────────────

export const commentTranslationFunction = inngest.createFunction(
  {
    id: "comment-translation",
    retries: 3, // Rate Limit 자동 재시도
    triggers: [{ event: "comment/translation.requested" as const }],
  },
  async ({ event }) => {
    const { commentId, userId, content, sourceLang, targetLangs } = event.data as {
      commentId: string
      userId: string
      content: string
      sourceLang: string
      targetLangs: string[]
    }

    if (!targetLangs || targetLangs.length === 0) {
      return { status: "skipped", reason: "no target languages" }
    }

    // 0. Race Condition 방어: comment가 실제로 DB에 쓰여질 때까지 최대 3초간 대기 (500ms 간격 폴링)
    let commentExists = false
    for (let i = 0; i < 6; i++) {
      const comment = await prisma.momentComment.findUnique({
        where: { id: commentId },
        select: { id: true }
      })
      if (comment) {
        commentExists = true
        break
      }
      console.log(`[CommentTranslation] Comment ${commentId}를 DB에서 찾는 중... 재시도 (${i + 1}/6)`)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    if (!commentExists) {
      console.error(`[CommentTranslation Failed] Comment ${commentId}가 DB에 존재하지 않습니다.`)
      throw new Error(`[Transient Error] Comment ${commentId} not found in database yet. Retrying...`)
    }

    // 1. pending 레코드 미리 생성
    for (const locale of targetLangs) {
      await prisma.momentCommentTranslation.upsert({
        where: { comment_id_locale: { comment_id: commentId, locale } },
        create: {
          comment_id: commentId,
          locale,
          content: "",
          status: "pending",
        },
        update: {
          status: "pending",
        },
      })
    }

    try {
      // 2. API 키 조회
      const { apiKey, provider } = await resolveApiKeyByUserId(userId)

      // 3. 통합 번역 코어 호출 (Comment Context)
      const result = await translateBabelContent({
        fields: { content },
        sourceLang,
        targetLangs,
        context: "comment",
        apiKey,
        provider,
        userId,
      })

      // 4. 성공한 번역 저장
      const tokensPerLang = Math.ceil(
        result.tokensUsed / Math.max(1, Object.keys(result.translations).length)
      )

      let completedCount = 0
      for (const [locale, fields] of Object.entries(result.translations)) {
        if (fields.content) {
          await prisma.momentCommentTranslation.upsert({
            where: { comment_id_locale: { comment_id: commentId, locale } },
            create: {
              comment_id: commentId,
              locale,
              content: fields.content,
              status: "completed",
              tokens_used: tokensPerLang,
            },
            update: {
              content: fields.content,
              status: "completed",
              tokens_used: tokensPerLang,
            },
          })
          completedCount++
        }
      }

      // 5. 누락/실패 언어 처리
      for (const locale of targetLangs) {
        if (!result.translations[locale] || !result.translations[locale].content) {
          await prisma.momentCommentTranslation.update({
            where: { comment_id_locale: { comment_id: commentId, locale } },
            data: { status: "failed" },
          })
        }
      }

      console.log(
        `[CommentTranslation] 완료: commentId=${commentId}, ${completedCount}/${targetLangs.length} 언어 완료`
      )
      return {
        status: "completed",
        completedCount,
        totalLangs: targetLangs.length,
      }
    } catch (err: any) {
      console.error(`[CommentTranslation] 실패: commentId=${commentId}`, err?.message)
      await prisma.momentCommentTranslation.updateMany({
        where: { comment_id: commentId, status: "pending" },
        data: { status: "failed" },
      })

      // [Babel Comment] API 키 누락 또는 복호화 에러 발생 시, Inngest 재시도 없이 번역을 즉시 패스(스킵)합니다.
      const isMissingKeyError = err?.message?.includes("[resolveApiKeyByUserId Error]") || 
                                err?.message?.includes("[resolveApiKeyByUserId Decryption Error]")
      if (isMissingKeyError) {
        console.warn(`[CommentTranslation Skipped] API 키가 유효하지 않아 번역을 생략(스킵)합니다: commentId=${commentId}`)
        return { status: "skipped", reason: "no valid api key" }
      }

      throw err // Inngest 재시도
    }
  }
)
