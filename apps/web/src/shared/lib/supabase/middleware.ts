import { SUPPORTED_LOCALES } from '@/i18n/routing'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, response?: NextResponse) {
  let supabaseResponse = response || NextResponse.next({
    request,
  })

  // 1. 순수 경로 분석 및 퍼블릭 루트 여부 감지 (예외 발생 시 세이프가드에 활용)
  const pathname = request.nextUrl.pathname
  const segments = pathname.split('/')
  const maybeLocale = segments[1] || ''
  const strippedPathname = (SUPPORTED_LOCALES as readonly string[]).includes(maybeLocale)
    ? '/' + segments.slice(2).join('/')
    : pathname

  const isAuthPage = strippedPathname.startsWith('/auth/')
  const isApiRoute = strippedPathname.startsWith('/api/')
  const GALAXY_SLUGS = ['pixelyf']
  const firstSegment = strippedPathname.split('/')[1] || ''
  const isGalaxyPage = GALAXY_SLUGS.includes(firstSegment)
  const isRootPage = strippedPathname === '/' || strippedPathname === ''
  const isAboutPage = strippedPathname.startsWith('/about')
  const isSupabaseProxy = strippedPathname.startsWith('/supabase/')
  const isPresentation = strippedPathname.startsWith('/presentation')
  const isSeoFile = strippedPathname.endsWith('.xml') || strippedPathname.endsWith('.txt')
  const isPublicRoute = isAuthPage || isApiRoute || isGalaxyPage || isRootPage || isAboutPage || isSupabaseProxy || isPresentation || isSeoFile

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
            // [FEAT] NextResponse.next() 신규 생성 덮어쓰기 로직 완전 폐기!
            // 전달받은 기존 supabaseResponse 레퍼런스에 직접 쿠키 세팅 수행
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, { ...options, secure: true })
            )
          },
        },
        cookieOptions: {
          name: 'sb-pixelyf-auth',
          secure: true,
        }
      }
    )

    const {
      data: { user },
      error
    } = await supabase.auth.getUser()

    if (error) {
      if (error.name === 'AuthSessionMissingError') {
        console.warn('[미들웨어] 활성화된 로그인 세션이 없습니다. (비로그인 사용자)')
      } else {
        console.warn(`[미들웨어] 사용자 세션 조회 경고: ${error.message} (${error.name})`)
      }
    }

    if (!user && !isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      const redirectResponse = NextResponse.redirect(url)
      // [FEAT] 리다이렉트 응답 객체에도 갱신된 쿠키가 누락 없이 심어지도록 완벽히 이식
      supabaseResponse.cookies.getAll().forEach(c => redirectResponse.cookies.set(c.name, c.value))
      return redirectResponse
    }
  } catch (err) {
    // 세션 갱신/검증 과정 중 어떠한 예외가 발생하더라도 520 에러로 다운되지 않도록 Fail-Safe 구현
    console.error('[Middleware] Supabase session update failed critically:', err)
    
    // 오염된 쿠키 강제 초기화 시도
    try {
      supabaseResponse.cookies.delete('sb-pixelyf-auth')
    } catch (_) {}

    // 비정상 예외 상황에서도 보호 대상 경로는 강제로 로그인 페이지로 튕겨냄 (보안성 확보)
    if (!isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
