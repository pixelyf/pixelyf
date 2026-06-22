/**
 * [AI 프로바이더 키 CRUD API]
 * GET    /api/ai/providers — 등록된 키 목록 조회 (복호화 없이 메타데이터만)
 * POST   /api/ai/providers — 보호 키(폴백 프로바이더) 추가
 * PATCH  /api/ai/providers — 기존 키 변경
 * DELETE /api/ai/providers — 키 삭제
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { detectProvider } from '@/shared/lib/ai/provider'
import { validateAndSelectModel } from '@/shared/lib/ai/modelSelector'
import { encryptApiKey } from '@/shared/lib/ai/crypto'

/** GET — 등록된 AI 키 메타데이터 목록 조회 (키 원본 미반환) */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keys = await prisma.aiProviderKey.findMany({
      where: { userId: user.id },
      select: { provider: true, isActive: true, lastValidatedAt: true },
      orderBy: { lastValidatedAt: 'desc' },
    })

    return NextResponse.json({ keys })
  } catch (error: any) {
    console.error('[AI providers GET]:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}

/** POST — 보호 키(추가 프로바이더) 등록 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey } = await req.json()
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 필요합니다.' }, { status: 400 })
    }

    const provider = detectProvider(apiKey.trim())
    if (!provider) {
      return NextResponse.json({ error: '지원하지 않는 키 형식입니다.' }, { status: 400 })
    }

    // 검증
    await validateAndSelectModel(apiKey.trim(), provider)

    // 암호화 저장
    const encrypted = encryptApiKey(apiKey.trim())
    await prisma.aiProviderKey.upsert({
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

    return NextResponse.json({ success: true, provider })

  } catch (error: any) {
    console.error('[AI providers POST]:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}

/** PATCH — 기존 키 변경 */
export async function PATCH(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey, provider: targetProvider } = await req.json()
    if (!apiKey || !targetProvider) {
      return NextResponse.json({ error: 'apiKey와 provider가 필요합니다.' }, { status: 400 })
    }

    // 검증
    await validateAndSelectModel(apiKey.trim(), targetProvider)

    const encrypted = encryptApiKey(apiKey.trim())
    await prisma.aiProviderKey.update({
      where: { userId_provider: { userId: user.id, provider: targetProvider } },
      data: {
        apiKeyEncrypted: encrypted,
        isActive: true,
        lastValidatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[AI providers PATCH]:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}

/** DELETE — 키 삭제 */
export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { provider: targetProvider } = await req.json()
    if (!targetProvider) {
      return NextResponse.json({ error: 'provider가 필요합니다.' }, { status: 400 })
    }

    // 기본 프로바이더 삭제 시 자동 전환 또는 AI 비활성화 처리
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { ai_primary_provider: true },
    })
    if (userData?.ai_primary_provider === targetProvider) {
      // 다른 활성 키가 있는지 확인
      const otherKey = await prisma.aiProviderKey.findFirst({
        where: {
          userId: user.id,
          provider: { not: targetProvider },
          isActive: true,
        },
      })

      if (otherKey) {
        // 다른 키가 있으면 primary를 자동 전환
        await prisma.user.update({
          where: { id: user.id },
          data: { ai_primary_provider: otherKey.provider },
        })
      } else {
        // 마지막 키 삭제 → AI 기능 비활성화 (errorHandler.handleKeyInvalid 패턴)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ai_enabled: false,
            ai_primary_provider: null,
          },
        })
        await prisma.aiSoul.updateMany({
          where: { userId: user.id },
          data: { isActive: false },
        })
      }
    }

    await prisma.aiProviderKey.deleteMany({
      where: { userId: user.id, provider: targetProvider },
    })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[AI providers DELETE]:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}
