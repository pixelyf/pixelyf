import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  // [FIX] callback/route.ts와 동일한 패턴 — Response 객체에 쿠키 삭제를 명시적으로 주입
  const response = NextResponse.redirect(new URL('/auth/login', request.url), {
    status: 302,
  })

  try {
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
                // Next.js 내부 cookieStore에 갱신
                cookieStore.set(name, value, { ...options, secure: true })
                // 브라우저로 응답할 Response 객체에 직접 주입 (쿠키 삭제 보장)
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

    await supabase.auth.signOut()
    return response
  } catch (error) {
    console.error('Sign Out Error:', error)
    return response
  }
}
