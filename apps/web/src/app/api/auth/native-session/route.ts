import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * 네이티브 앱에서 Supabase 로그인 후 획득한 토큰을 받아
 * 서버 사이드에서 세션을 설정하고 Set-Cookie로 응답합니다.
 *
 * 이 엔드포인트를 통해 WebView의 쿠키에 정확한 Supabase 세션이 설정됩니다.
 * - 쿠키 키 이름: Supabase SDK가 내부적으로 결정 (sb-{hash}-auth-token)
 * - httpOnly, Secure 속성: SDK가 자동 적용
 */
export async function POST(request: NextRequest) {
  try {
    const { access_token, refresh_token } = await request.json()

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: 'access_token과 refresh_token이 필요합니다.' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, secure: true })
            )
          },
        },
        cookieOptions: {
          name: 'sb-pixelyf-auth',
          secure: true,
        }
      }
    )

    // Supabase SDK가 세션을 설정하고, setAll 콜백을 통해 올바른 쿠키를 자동 설정
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (error) {
      console.error('[native-session] setSession error:', error.message)

      // [HOT-RELOAD / DUPLICATE CALL FIX]
      // 모바일 앱 리로드 시, 이전에 사용된 refresh_token이 다시 전송되어 "Already Used" 에러가 발생할 수 있습니다.
      // 이 경우 WebView 쿠키에 이미 유효한 세션이 설정되어 있는지 확인하고, 존재하면 성공으로 처리합니다.
      if (error.message.toLowerCase().includes('already used')) {
        const { data: cookieSession } = await supabase.auth.getSession()
        if (cookieSession?.session) {
          console.log('[native-session] Session already exists in cookies (recovery successful)')
          return NextResponse.json({ success: true, userId: cookieSession.session.user.id })
        }
      }

      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }

    console.log('[native-session] Session set for user:', data.user?.id)

    return NextResponse.json({ success: true, userId: data.user?.id })
  } catch (e) {
    console.error('[native-session] Unexpected error:', e)
    return NextResponse.json(
      { error: '세션 설정 실패' },
      { status: 500 }
    )
  }
}
