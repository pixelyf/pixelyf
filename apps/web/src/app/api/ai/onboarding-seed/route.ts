/**
 * [AMGE v5 온보딩 초기 기억 주입 API]
 * POST /api/ai/onboarding-seed
 *
 * AI 은하 진입(enter) 성공 직후 fire-and-forget으로 호출됩니다.
 * 유저가 선택한 4축 텐션 키워드를 AvatarNode로 변환해 DB에 심습니다.
 *
 * 핵심: LLM 호출 0회, generateEmbedding만 병렬 4회 → 빠르고 비용 0원
 *
 * 요청: { keywords: { anchor: string, dopamine: string, trigger: string, tone: string } }
 * 응답: { success: true, nodesCreated: number }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { generateEmbedding } from '@/shared/lib/ai/amge/embedding'

// 4축 키워드 → AvatarNode 타입 매핑
const AXIS_TYPE_MAP = {
  anchor:  'PERSON',    // 본질 앵커 (직급, 소속)
  dopamine:'OBJECT',    // 도파민/집착 (행동, 사물)
  trigger: 'EMOTION',   // 발작 버튼/결핍 (예민 포인트)
  tone:    'ABSTRACT',  // 발화 톤 (문체 메타데이터)
} as const

// 초기 시드 기억은 핵심 자아이므로 강한 importance 고정
const SEED_IMPORTANCE = 0.85

export async function POST(req: Request) {
  try {
    // 인증
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // AiSoul 조회 (soulId + 암호화된 API 키 같이)
    const soul = await prisma.aiSoul.findFirst({
      where: { userId: user.id, isActive: true },
      select: {
        id: true,
        user: {
          select: {
            ai_provider_keys: {
              where: { isActive: true },
              select: { apiKeyEncrypted: true, provider: true },
              take: 1,
            },
          },
        },
      },
    })

    if (!soul) {
      return NextResponse.json({ error: 'AI Soul을 찾을 수 없습니다.' }, { status: 404 })
    }

    const keyData = soul.user?.ai_provider_keys?.[0]
    if (!keyData) {
      return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 400 })
    }

    // API 키 복호화
    const { decryptApiKey } = await import('@/shared/lib/ai/crypto')
    const apiKey = decryptApiKey(keyData.apiKeyEncrypted)
    const provider = keyData.provider as any

    // 요청 바디 파싱
    const body = await req.json()
    const { keywords } = body as {
      keywords: { anchor: string; dopamine: string; trigger: string; tone: string }
    }

    if (!keywords?.anchor || !keywords?.dopamine || !keywords?.trigger || !keywords?.tone) {
      return NextResponse.json({ error: '4개의 키워드가 모두 필요합니다.' }, { status: 400 })
    }

    const soulId = soul.id
    let nodesCreated = 0

    // 4개 키워드 병렬 임베딩 생성 (LLM 0회, 비용 최소화)
    const entries = Object.entries(keywords) as [keyof typeof AXIS_TYPE_MAP, string][]

    const embeddingResults = await Promise.allSettled(
      entries.map(([axis, concept]) =>
        generateEmbedding(apiKey, provider, concept).then(vec => ({ axis, concept, vec }))
      )
    )

    // 순차적으로 DB 저장 (중복 upsert)
    for (const result of embeddingResults) {
      if (result.status !== 'fulfilled' || !result.value.vec) continue
      const { axis, concept, vec } = result.value
      const type = AXIS_TYPE_MAP[axis]
      const embeddingStr = `[${vec.join(',')}]`

      try {
        // 이미 존재하면 importance만 강화 (upsert)
        const existing = await prisma.avatarNode.findUnique({
          where: { soulId_concept: { soulId, concept } },
        })

        if (existing) {
          await prisma.avatarNode.update({
            where: { id: existing.id },
            data: { importance: SEED_IMPORTANCE, lastAccess: new Date() },
          })
        } else {
          const node = await prisma.avatarNode.create({
            data: { soulId, concept, type, importance: SEED_IMPORTANCE },
          })
          // vector 컬럼은 Prisma Unsupported 타입이므로 $executeRaw로 직접 세팅
          await prisma.$executeRaw`
            UPDATE avatar_nodes
            SET embedding = ${embeddingStr}::vector
            WHERE id = ${node.id}::uuid
          `
        }
        nodesCreated++
        console.log(`[OnboardingSeed] ✅ ${axis}: "${concept}" (${type})`)
      } catch (err) {
        console.error(`[OnboardingSeed] ❌ ${axis} 노드 저장 실패:`, err)
      }
    }

    return NextResponse.json({ success: true, nodesCreated })
  } catch (error: any) {
    console.error('[OnboardingSeed] Error:', error)
    return NextResponse.json({ error: '초기 기억 주입에 실패했습니다.' }, { status: 500 })
  }
}
