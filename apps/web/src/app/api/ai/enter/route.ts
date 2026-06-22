/**
 * [AI 온보딩 진입 API]
 * POST /api/ai/enter
 *
 * 원자적 트랜잭션: 키 검증 → 키 암호화 → SOUL 생성 → AI 좌표 생성 → User 활성화
 *
 * 요청: { apiKey, selectedModel?, compactionModel? }
 * 응답: { soulId, galaxyKey: 'PIXELYF', position: { x: 0, y: 0 } }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { detectProvider, type AiProvider } from '@/shared/lib/ai/provider'
import { validateAndSelectModel, DEFAULT_MODELS, COMPACTION_MODELS } from '@/shared/lib/ai/modelSelector'
import { encryptApiKey } from '@/shared/lib/ai/crypto'
import { generateSoulPrompt, type SoulPromptData } from '@/shared/lib/ai/soulEngine'

export async function POST(req: Request) {
  try {
    // 인증
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 이미 활성화된 유저 체크
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { ai_enabled: true },
    })
    if (existingUser?.ai_enabled) {
      return NextResponse.json({ error: '이미 AI 은하가 활성화되어 있습니다.' }, { status: 409 })
    }

    const body = await req.json()
    const { apiKey, selectedModel, compactionModel, useRegistered, provider: requestedProvider } = body

    let finalApiKey = apiKey
    let provider = requestedProvider as AiProvider

    if (useRegistered || !finalApiKey) {
      let keyRecord
      if (provider) {
        keyRecord = await prisma.aiProviderKey.findUnique({
          where: { userId_provider: { userId: user.id, provider } },
        })
      } else {
        keyRecord = await prisma.aiProviderKey.findFirst({
          where: { userId: user.id, isActive: true },
          orderBy: { lastValidatedAt: 'desc' },
        })
      }

      if (!keyRecord || !keyRecord.isActive) {
        return NextResponse.json({ error: '설정에 등록된 활성 API 키를 찾을 수 없습니다.' }, { status: 400 })
      }

      provider = keyRecord.provider as AiProvider
      const { decryptApiKey } = await import('@/shared/lib/ai/crypto')
      finalApiKey = decryptApiKey(keyRecord.apiKeyEncrypted)
    } else {
      if (typeof finalApiKey !== 'string') {
        return NextResponse.json({ error: 'API 키 형식이 유효하지 않습니다.' }, { status: 400 })
      }
      provider = detectProvider(finalApiKey.trim()) as AiProvider
      if (!provider) {
        return NextResponse.json({ error: '지원하지 않는 API 키 형식입니다.' }, { status: 400 })
      }
    }

    const { model } = await validateAndSelectModel(finalApiKey.trim(), provider, selectedModel)
    const finalCompactionModel = compactionModel || COMPACTION_MODELS[provider]

    // 2. UserPersona + Moments + onboarding_answers 수집
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        persona: true,
        onboarding_answers: { orderBy: { question_no: 'asc' } },
        moments: {
          where: { is_deleted: false },
          orderBy: { created_at: 'desc' },
          take: 5,
          select: { content: true },
        },
      },
    })

    if (!userData) {
      return NextResponse.json({ error: '유저 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 3. SOUL 프롬프트 생성
    const persona = userData.persona
    const soulData: SoulPromptData = {
      displayName: userData.display_name,
      personaCode: persona?.persona_code || 'STARTER',
      personaName: persona?.persona_name || '탐험가',
      personaScores: {
        e_i: persona?.score_e_i ?? 50,
        s_n: persona?.score_s_n ?? 50,
        t_f: persona?.score_t_f ?? 50,
        j_p: persona?.score_j_p ?? 50,
        morning_night: persona?.score_morning_night ?? 50,
        home_open: persona?.score_home_open ?? 50,
        spend_save: persona?.score_spend_save ?? 50,
        depth_broad: persona?.score_depth_broad ?? 50,
        calm_vibrant: persona?.score_calm_vibrant ?? 50,
        yolo_future: persona?.score_yolo_future ?? 50,
      },
      occupation: persona?.occupation || undefined,
      interestTags: persona?.interest_tags?.length ? persona.interest_tags : undefined,
      lifeStage: persona?.life_stage || undefined,
    }

    const soulPrompt = generateSoulPrompt(soulData)


    // 5. 원자적 트랜잭션: 키 저장 + AiSoul 생성 + 좌표 생성 + User 활성화
    const encrypted = encryptApiKey(finalApiKey.trim())

    const result = await prisma.$transaction(async (tx: any) => {
      // AiProviderKey 생성 (upsert — 기존 키 교체 대응)
      await tx.aiProviderKey.upsert({
        where: { userId_provider: { userId: user.id, provider } },
        create: {
          userId: user.id,
          provider,
          apiKeyEncrypted: encrypted,
          lastValidatedAt: new Date(),
        },
        update: {
          apiKeyEncrypted: encrypted,
          isActive: true,
          lastValidatedAt: new Date(),
        },
      })

      // AiSoul 생성
      const soul = await tx.aiSoul.create({
        data: {
          userId: user.id,
          soulPrompt,
        },
      })

      // User 활성화
      await tx.user.update({
        where: { id: user.id },
        data: {
          ai_enabled: true,
          ai_primary_provider: provider,
          ai_primary_model: model,
          ai_compaction_model: finalCompactionModel,
        },
      })

      return soul
    })

    // [v3] 온보딩 완료 후 비동기 말투 분석 (실패해도 응답에 영향 없음)
    import('@/shared/lib/ai/toneAnalyzer')
      .then(({ analyzeToneProfile }) => analyzeToneProfile(user.id))
      .catch((err) => console.error('[AI enter] 말투 분석 비동기 실패 (무시):', err))

    return NextResponse.json({
      soulId: result.id,
      galaxyKey: 'PIXELYF',
      position: { x: 0, y: 0 },
    })

  } catch (error: any) {
    console.error('[AI enter] Error:', error)
    return NextResponse.json({ error: 'AI 은하 진입에 실패했습니다.' }, { status: 500 })
  }
}
