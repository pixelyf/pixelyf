import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { inngest } from '@/lib/inngest'
import prisma from '@/shared/lib/prisma'
import { getCoreText, isTranslationSkipped } from '@/shared/lib/ai/babelGuard'
import { SUPPORTED_LOCALES } from '@/i18n/routing'


/**
 * [PANEL CRUD] 모먼트 수정 (content + images 수정 가능)
 * PUT /api/moments/[id]
 * body: { content: string, images?: any[] | null }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: momentId } = await params
    const { content, images, youtubeUrl, contentTags } = await request.json()

    // 입력 검증
    const trimmedContent = content?.trim()
    if (!trimmedContent) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }
    if (trimmedContent.length > 140) {
      return NextResponse.json({ error: 'Content exceeds 140 characters' }, { status: 400 })
    }

    // 소유권 검증: 본인의 모먼트만 수정 가능 및 변경 감지용 기존 본문 SELECT
    const { data: existing, error: fetchError } = await supabase
      .from('moments')
      .select('user_id, content')
      .eq('id', momentId)
      .eq('is_deleted', false)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Moment not found' }, { status: 404 })
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not your moment' }, { status: 403 })
    }

    // 수정 실행
    const { data: updated, error: updateError } = await supabase
      .from('moments')
      .update({
        content: trimmedContent,
        ...(images !== undefined && { images: images && images.length > 0 ? images : null }),
        ...(youtubeUrl !== undefined && { youtube_url: youtubeUrl || null }),
        ...(contentTags !== undefined && {
          content_tags: contentTags || [],
          topic_tags: contentTags || [],
        }),
      })
      .eq('id', momentId)
      .select()
      .single()

    if (updateError) throw updateError

    // ─── [Babel Feed] 지능형 번역 동기화 및 실시간 재번역 파이프라인 ───
    const oldContent = existing.content || ''
    const newContent = trimmedContent

    const isContentUnchanged = oldContent === newContent
    const isCoreUnchanged = getCoreText(oldContent) === getCoreText(newContent)

    // 원본이 실질적으로 변경되었을 때만 재번역 파이프라인 작동
    if (!isContentUnchanged && !isCoreUnchanged) {
      try {
        // 1. 기존 번역 캐시 데이터 일괄 물리 삭제 (DELETE)
        await supabase
          .from('moment_translations')
          .delete()
          .eq('moment_id', momentId)

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
              (lang) => lang !== (userData.language || 'ko')
            )

            if (targetLangs.length > 0) {
              await inngest.send({
                name: 'feed/translation.requested',
                data: {
                  momentId,
                  userId: user.id,
                  content: newContent,
                  sourceLang: userData.language || 'ko',
                  targetLangs,
                },
              })
              console.log(`[Babel Feed Update] 재번역 요청 전송 완료: momentId=${momentId}, ${targetLangs.length}개 언어`)
            }
          }
        } else {
          console.log(`[Babel Feed Update] 지능형 번역 가드 작동 - 번역 스킵 처리: momentId=${momentId}`)
        }
      } catch (babelErr: any) {
        // 수정 완료 API 자체는 성공해야 하므로 에러 캡처 후 경고 로그만 남김
        if (babelErr?.code === 'ECONNREFUSED' || babelErr?.cause?.code === 'ECONNREFUSED') {
          console.warn('[Babel Feed Update] Inngest 데브 서버가 오프라인 상태입니다. 로컬 번역 파이프라인을 작동하려면 백그라운드 터미널에서 "npx inngest-cli dev"를 실행하십시오.')
        } else {
          console.error('[Babel Feed Update] 재번역 파이프라인 트리거 오류:', babelErr)
        }
      }
    }

    return NextResponse.json({ success: true, moment: updated })
  } catch (error) {
    console.error('Update Moment Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * [PANEL CRUD] 모먼트 소프트 삭제 (is_deleted = true)
 * DELETE /api/moments/[id]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: momentId } = await params

    // 소유권 검증: 본인의 모먼트만 삭제 가능
    const { data: existing, error: fetchError } = await supabase
      .from('moments')
      .select('user_id')
      .eq('id', momentId)
      .eq('is_deleted', false)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Moment not found' }, { status: 404 })
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not your moment' }, { status: 403 })
    }

    // 소프트 삭제 (물리 삭제 아닌 is_deleted 플래그 전환)
    const { error: deleteError } = await supabase
      .from('moments')
      .update({
        is_deleted: true,
      })
      .eq('id', momentId)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete Moment Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
