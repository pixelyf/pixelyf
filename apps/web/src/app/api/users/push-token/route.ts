import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

/**
 * POST /api/users/push-token
 * 모바일 앱(Expo)에서 브릿지를 통해 전달받은 Expo Push Token을 DB에 저장합니다.
 * 
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    // Expo Push Token 형식 검증 (ExponentPushToken[...] 또는 ExpoPushToken[...])
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      return NextResponse.json({ error: 'Invalid Expo push token format' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: authUser.id },
      data: { expo_push_token: token },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[push-token] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/users/push-token
 * 로그아웃 또는 푸시 비활성화 시 토큰을 DB에서 제거합니다.
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: authUser.id },
      data: { expo_push_token: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[push-token] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
