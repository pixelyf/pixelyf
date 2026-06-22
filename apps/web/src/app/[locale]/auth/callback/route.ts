import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  // 인증 후 이동할 최종 목적지 (기본값: / → PIXELYF 루트 은하)
  const next = searchParams.get('next') ?? '/'

  const requestUrl = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin

  // 1. 임시 리다이렉트 응답 객체를 기본값으로 우선 생성합니다.
  const response = NextResponse.redirect(`${siteUrl}/auth/login`)

  if (code) {
    const cookieStore = await cookies()

    // 2. [핵심] Next.js cookieStore와 Response 헤더 둘 모두에 쿠키를 확실히 주입하는 Supabase 클라이언트를 직접 구성합니다.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                // Next.js 내부 cookieStore에 갱신 (서버 컴포넌트 갱신용)
                cookieStore.set(name, value, { ...options, secure: true })
                // 브라우저로 응답할 Response 객체에 직접 주입 (브라우저 쿠키 연동용!)
                response.cookies.set(name, value, { ...options, secure: true })
              })
            } catch {
              // Route Handler 내의 무시 가능한 쿠키 에러 예외 처리
            }
          },
        },
        cookieOptions: {
          name: 'sb-pixelyf-auth',
          secure: true,
        }
      }
    )

    // 3. 일회용 코드를 실제 세션 쿠키로 교환 (이 과정에서 setAll이 동작해 response에 쿠키가 주입됨)
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && sessionData.user) {
      // 4. 신규 가입자 여부 체크
      const { data: persona } = await supabase
        .from('user_personas')
        .select('persona_code')
        .eq('user_id', sessionData.user.id)
        .single()

      const isNewUser = !persona || persona.persona_code === 'STARTER'
      const destination = isNewUser ? '/onboarding' : next

      // 5. [핵심] 리다이렉션 목적지를 동적으로 Location 헤더에 덮어씁니다.
      response.headers.set('Location', `${siteUrl}${destination}`)
      return response
    }

    console.error('Auth callback exchange error:', error)
  }

  // 실패 시 로그인 페이지로 에러 상태와 함께 리다이렉션
  return NextResponse.redirect(`${siteUrl}/auth/login?status=error&message=auth_callback_failed`)
}
