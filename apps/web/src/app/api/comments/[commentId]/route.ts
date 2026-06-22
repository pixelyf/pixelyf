import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import { inngest } from '@/lib/inngest'
import { getCoreText, isTranslationSkipped } from '@/shared/lib/ai/babelGuard'
import { SUPPORTED_LOCALES } from '@/i18n/routing'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 권한 확인: 본인이 작성한 댓글인지 확인
    const existingComment = await prisma.momentComment.findUnique({
      where: { id: commentId }
    })

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (existingComment.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 트랜잭션: 댓글 상태를 소프트 삭제로 변경하고, 모먼트의 카운트 감소
    await prisma.$transaction(async (tx: any) => {
      await tx.momentComment.update({
        where: { id: commentId },
        data: { is_deleted: true }
      })

      await tx.moment.update({
        where: { id: existingComment.moment_id },
        data: { comment_count: { decrement: 1 } }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete Comment Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content } = await request.json()

    if (!content?.trim() || content.length > 500) {
      return NextResponse.json({ error: 'Invalid content' }, { status: 400 })
    }

    // 권한 확인: 본인이 작성한 댓글인지 확인
    const existingComment = await prisma.momentComment.findUnique({
      where: { id: commentId }
    })

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (existingComment.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 수정 (소프트 삭제된 댓글은 수정 불가 처리)
    if (existingComment.is_deleted) {
       return NextResponse.json({ error: 'Cannot edit deleted comment' }, { status: 400 })
    }

    const trimmedContent = content.trim()

    const updatedComment = await prisma.momentComment.update({
      where: { id: commentId },
      data: { content: trimmedContent }
    })

    // ─── [Babel Comment] 지능형 번역 동기화 및 실시간 재번역 파이프라인 ───
    // 모먼트 PUT과 동일한 프로세스 적용
    const oldContent = existingComment.content || ''
    const newContent = trimmedContent

    const isContentUnchanged = oldContent === newContent
    const isCoreUnchanged = getCoreText(oldContent) === getCoreText(newContent)

    // 원본이 실질적으로 변경되었을 때만 재번역 파이프라인 작동
    if (!isContentUnchanged && !isCoreUnchanged) {
      try {
        // 1. 기존 번역 캐시 데이터 일괄 물리 삭제
        await prisma.momentCommentTranslation.deleteMany({
          where: { comment_id: commentId }
        })

        // 2. 가드 조건 검사: 번역 스킵 조건에 부합하지 않을 경우에만 재번역 요청 전송
        if (!isTranslationSkipped(newContent)) {
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
              (lang: any) => lang !== (userData.language || 'ko')
            )

            if (targetLangs.length > 0) {
              await inngest.send({
                name: 'comment/translation.requested',
                data: {
                  commentId,
                  userId: user.id,
                  content: newContent,
                  sourceLang: userData.language || 'ko',
                  targetLangs,
                },
              })
              console.log(`[Babel Comment Update] 재번역 요청 전송 완료: commentId=${commentId}, ${targetLangs.length}개 언어`)
            }
          } else {
            console.warn(`[Babel Comment Update] API 키 미보유 — 번역 스킵: commentId=${commentId}`)
          }
        } else {
          console.log(`[Babel Comment Update] 지능형 번역 가드 작동 — 번역 스킵: commentId=${commentId}`)
        }
      } catch (babelErr) {
        // 수정 완료 API 자체는 성공해야 하므로 에러 캡처 후 경고 로그만 남김
        console.error('[Babel Comment Update] 재번역 파이프라인 트리거 오류:', babelErr)
      }
    }

    return NextResponse.json(updatedComment)
  } catch (error) {
    console.error('Update Comment Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
