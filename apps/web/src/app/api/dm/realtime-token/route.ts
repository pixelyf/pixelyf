import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { SignJWT } from 'jose'

/**
 * GET /api/dm/realtime-token
 * Supabase Realtime 인증을 위한 custom JWT 발급
 *
 * Supabase postgres_changes는 RLS 정책을 통해 이벤트를 필터링하므로,
 * auth.uid()가 올바르게 설정된 JWT가 필요합니다.
 *
 * payload:
 *   sub: user.id (auth.uid()로 사용됨)
 *   role: 'authenticated' (RLS TO authenticated와 매칭)
 *   iss: 'supabase'
 *   aud: 'authenticated'
 *   exp: +1시간
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jwtSecret = process.env.SUPABASE_JWT_SECRET
    if (!jwtSecret) {
      console.error('[Realtime Token] SUPABASE_JWT_SECRET is not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const secret = new TextEncoder().encode(jwtSecret)
    const now = Math.floor(Date.now() / 1000)

    const token = await new SignJWT({
      sub: user.id,
      role: 'authenticated',
      iss: 'supabase',
      aud: 'authenticated',
      iat: now,
      exp: now + 3600, // 1시간
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .sign(secret)

    return NextResponse.json({
      success: true,
      data: { token },
    })
  } catch (error) {
    console.error('[Realtime Token] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
