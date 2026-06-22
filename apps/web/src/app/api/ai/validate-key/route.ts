/**
 * [AI 키 검증 API]
 * POST /api/ai/validate-key
 *
 * 요청: { apiKey: string }
 * 응답: { provider, availableModels, defaultModel }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { detectProvider, type AiProvider } from '@/shared/lib/ai/provider'
import { validateAndSelectModel, DEFAULT_MODELS } from '@/shared/lib/ai/modelSelector'

export async function POST(req: Request) {
  try {
    // 인증 (기존 패턴)
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { apiKey, useRegistered, provider: requestedProvider } = body

    let finalApiKey = apiKey
    let provider = requestedProvider as AiProvider

    if (useRegistered) {
      if (!provider) {
        return NextResponse.json({ error: '프로바이더 정보가 필요합니다.' }, { status: 400 })
      }

      const keyRecord = await prisma.aiProviderKey.findUnique({
        where: {
          userId_provider: {
            userId: user.id,
            provider,
          },
        },
      })

      if (!keyRecord || !keyRecord.isActive) {
        return NextResponse.json({ error: '설정에 등록된 활성 API 키를 찾을 수 없습니다.' }, { status: 400 })
      }

      const { decryptApiKey } = await import('@/shared/lib/ai/crypto')
      finalApiKey = decryptApiKey(keyRecord.apiKeyEncrypted)
    } else {
      if (!finalApiKey || typeof finalApiKey !== 'string' || finalApiKey.trim().length < 10) {
        return NextResponse.json({ error: 'API 키가 너무 짧습니다.' }, { status: 400 })
      }

      // 프로바이더 감지
      provider = detectProvider(finalApiKey.trim()) as AiProvider
      if (!provider) {
        return NextResponse.json({
          error: '지원하지 않는 API 키 형식입니다. Gemini(AIza...), OpenAI(sk-...), Anthropic(sk-ant-...) 키를 입력해주세요.'
        }, { status: 400 })
      }
    }

    // 모델 검증
    const { model, availableModels } = await validateAndSelectModel(finalApiKey.trim(), provider)

    return NextResponse.json({
      provider,
      availableModels,
      defaultModel: model,
    })

  } catch (error: any) {
    console.error('[AI validate-key] Error:', error)

    // 프로바이더 API 에러 구분
    if (error.message?.includes('401') || error.message?.includes('유효하지 않')) {
      return NextResponse.json({ error: '❌ API 키가 유효하지 않습니다.' }, { status: 401 })
    }
    if (error.message?.includes('402') || error.message?.includes('크레딧')) {
      return NextResponse.json({ error: '💳 API 크레딧이 소진되었습니다.' }, { status: 402 })
    }
    if (error.message?.includes('최소 기준')) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }

    return NextResponse.json({ error: 'AI 서비스 연결에 실패했습니다.' }, { status: 500 })
  }
}
