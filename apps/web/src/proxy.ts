import { type NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing, SUPPORTED_LOCALES } from './i18n/routing'
import { updateSession } from '@/shared/lib/supabase/middleware'

const intlMiddleware = createIntlMiddleware(routing)

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // 1. [i18n] locale prefix를 제거하여 순수 경로를 추출 (/en/auth/login -> /auth/login)
  const segments = pathname.split('/')
  const maybeLocale = segments[1] || ''
  const strippedPathname = (SUPPORTED_LOCALES as readonly string[]).includes(maybeLocale)
    ? '/' + segments.slice(2).join('/')
    : pathname

  const isAuthPage = strippedPathname.startsWith('/auth/')
  const isPresentation = strippedPathname.startsWith('/presentation')

  // API 라우트, Supabase 프록시, 프리젠테이션 페이지는 intl/세션 미들웨어를 거치지 않고 바로 통과
  // API 라우트: 각 핸들러가 자체 Supabase 클라이언트로 인증 처리 (미들웨어 이중 getUser() 제거)
  // Supabase 프록시: 클라이언트 SDK가 Authorization 헤더로 인증 처리
  if (pathname.startsWith('/api/') || pathname.startsWith('/supabase/') || isPresentation) {
    return NextResponse.next({ request })
  }

  // 1. intl 프록시 실행 (locale 감지, 리다이렉트, rewrite 처리)
  const intlResponse = intlMiddleware(request)
  
  // 2. Supabase 세션 갱신 (intlResponse를 직접 전달하여 완벽한 Response Chaining 성취)
  const supabaseResponse = await updateSession(request, intlResponse)

  // 3. Supabase 내부에서 리다이렉트가 발생했을 경우(예: 비인증 유저 강제 리다이렉트) 즉시 반환
  if (supabaseResponse.headers.get('location')) {
    return supabaseResponse
  }

  // 4. 세션 쿠키와 다국어 헤더가 완벽히 결합된 체이닝 프록시 응답 최종 반환
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
