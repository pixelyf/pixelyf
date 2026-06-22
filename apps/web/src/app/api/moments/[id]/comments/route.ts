import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import { sendNotification } from '@/shared/services/notificationService'
import { isTranslationSkipped } from '@/shared/lib/ai/babelGuard'
import { SUPPORTED_LOCALES } from '@/i18n/routing'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor')
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const viewerLang = searchParams.get('lang') || 'ko'

    const comments = await prisma.momentComment.findMany({
      where: {
        moment_id: id,
        parent_id: null,
        is_deleted: false,
      },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { created_at: 'desc' },
      include: {
        user: {
          select: { id: true, display_name: true, supernova_tier: true, current_aura: true, avatar_image_url: true }
        },
        translations: {
          where: { status: 'completed' },
          select: { locale: true, content: true }
        },
        replies: {
          where: { is_deleted: false },
          orderBy: { created_at: 'asc' }, // 대댓글은 시간순(오래된 순)이 자연스러움
          include: {
            user: {
              select: { id: true, display_name: true, supernova_tier: true, current_aura: true, avatar_image_url: true }
            },
            translations: {
              where: { status: 'completed' },
              select: { locale: true, content: true }
            }
          }
        }
      }
    })

    let nextCursor = null
    if (comments.length > limit) {
      const nextItem = comments.pop()
      nextCursor = nextItem!.id
    }

    // [Babel Comment] viewerLang에 맞춰 댓글/대댓글 content 교체 (프론트 수정 0건)
    const applyTranslation = (comment: any) => {
      const translations = comment.translations || []
      let result = { ...comment }
      result.isTranslated = false
      result.originalContent = null

      if (viewerLang !== 'ko' && translations.length > 0) {
        const match = translations.find((t: any) => t.locale === viewerLang)
        if (match && match.content) {
          result.originalContent = result.content
          result.content = match.content
          result.isTranslated = true
        }
      }

      // 대댓글도 동일 적용
      if (result.replies && result.replies.length > 0) {
        result.replies = result.replies.map(applyTranslation)
      }

      // translations 필드는 응답에서 제거 (프론트에 불필요한 데이터 제거)
      delete result.translations
      return result
    }

    const translatedComments = comments.map(applyTranslation)

    return NextResponse.json({
      comments: translatedComments,
      nextCursor,
    })
  } catch (error) {
    console.error('Fetch Comments Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content, parentId } = await request.json()

    if (!content?.trim() || content.length > 500) {
      return NextResponse.json({ error: 'Invalid content' }, { status: 400 })
    }

    // 트랜잭션을 통해 댓글 생성 및 모먼트의 comment_count 증가를 원자적으로 처리
    const result = await prisma.$transaction(async (tx) => {
      if (parentId) {
        const parent = await tx.momentComment.findFirst({
          where: {
            id: parentId,
            moment_id: id,
            parent_id: null,
            is_deleted: false,
          },
          select: { id: true },
        })

        if (!parent) {
          throw new Error('INVALID_PARENT_COMMENT')
        }
      }

      const newComment = await tx.momentComment.create({
        data: {
          moment_id: id,
          user_id: user.id,
          content: content.trim(),
          parent_id: parentId || null,
        },
        include: {
          user: {
            select: { id: true, display_name: true, supernova_tier: true, current_aura: true, avatar_image_url: true }
          },
          replies: true // 방금 생성했으므로 빈 배열
        }
      })

      await tx.moment.update({
        where: { id: id },
        data: { comment_count: { increment: 1 } }
      })

      return newComment
    })

    // [알림 DB+Push] 댓글 알림 (자기 댓글은 제외) — 알림 실패가 댓글 실패로 이어지면 안 됨
    try {
      const momentData = await prisma.moment.findUnique({
        where: { id },
        select: { user_id: true },
      })
      if (momentData && momentData.user_id !== user.id) {
        const commenter = await prisma.user.findUnique({
          where: { id: user.id },
          select: { display_name: true },
        })
        await sendNotification({
          userId: momentData.user_id,
          type: 'COMMENT',
          title: `${commenter?.display_name || '누군가'}님이 댓글을 남겼습니다`,
          body: content.trim().slice(0, 50) + (content.length > 50 ? '…' : ''),
          link: `/?pixel=${momentData.user_id}&feed=${id}`,
          actorId: user.id,
          resourceId: id,
        })
      }
    } catch (notifError) {
      console.error('[Comments] Notification failed (non-critical):', notifError)
    }

    // [BFP 비동기 다국어] 댓글 작성 성공 시 Inngest 백그라운드 번역 요청 발행
    // 모먼트 POST와 동일한 프로세스: 가드 → API 키 검증 → 사용자 언어 설정 참조
    const trimmedBfpContent = content.trim()
    if (!isTranslationSkipped(trimmedBfpContent)) {
      try {
        const userData = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            language: true,
            feed_translation_languages: true,
            ai_provider_keys: { where: { isActive: true }, take: 1, select: { id: true } },
          },
        })

        const DEFAULT_LANGS = SUPPORTED_LOCALES
        if (
          userData &&
          userData.ai_provider_keys.length > 0
        ) {
          const userLangs = userData.feed_translation_languages && userData.feed_translation_languages.length > 0
            ? userData.feed_translation_languages
            : DEFAULT_LANGS

          const targetLangs = userLangs.filter(
            (lang) => lang !== (userData.language || 'ko')
          )

          if (targetLangs.length > 0) {
            const { inngest } = await import('@/lib/inngest')
            await inngest.send({
              name: 'comment/translation.requested',
              data: {
                commentId: result.id,
                userId: user.id,
                content: trimmedBfpContent,
                sourceLang: userData.language || 'ko',
                targetLangs,
              },
            })
            console.log(`[Babel Comment] 번역 요청 전송: commentId=${result.id}, ${targetLangs.length}개 언어`)
          }
        } else {
          console.warn(`[Babel Comment] API 키 미보유 — 번역 스킵: commentId=${result.id}`)
        }
      } catch (bfpError) {
        console.error('[Babel Comment Trigger Error (Non-critical)]:', bfpError)
      }
    } else {
      console.log(`[Babel Comment] 지능형 번역 가드 작동 — 번역 스킵: commentId=${result.id}`)
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PARENT_COMMENT') {
      return NextResponse.json({ error: 'Invalid parent comment' }, { status: 400 })
    }
    console.error('Create Comment Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
