'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import prisma from '@/shared/lib/prisma'
import { getMoodColors } from '@/shared/constants/moods'
import { calculatePosition } from '@/shared/lib/coordinateCalculator'
import { sendVerificationEmail } from '@/shared/lib/email/sender'
import { SUPPORTED_LOCALES } from '@/i18n/routing'

export async function login(formData: FormData) {
  console.log('Login attempt started at:', new Date().toISOString())
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  console.log(`Attempting login for: ${email}`)

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError) {
    console.error('Login failed for:', email, 'Error:', authError.message)
    if (authError.message.includes('Email not confirmed')) {
      return { error: 'errEmailNotConfirmed' }
    }
    return { error: authError.message }
  }

  // [중요] redirect()는 내부적으로 NEXT_REDIRECT를 throw하므로 try/catch 밖에서 호출해야 함
  // [핵심 수정] signInWithPassword() 후 getUser()를 호출하여 
  // onAuthStateChange(SIGNED_IN) → applyServerStorage() → setAll()이 
  // 완전히 실행되어 쿠키가 응답에 flush 되도록 보장
  console.log('Login success for:', email, 'ensuring session cookies are flushed...')
  await supabase.auth.getUser()
  console.log('Session cookies flushed, redirecting to /...')
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirm_password') as string
  const display_name = formData.get('display_name') as string
  const moodId = formData.get('pixel_color') as string || 'neutral'
  const colors = getMoodColors(moodId)

  // [UX 개선] 비밀번호 확인 검증
  if (password !== confirmPassword) {
    return { error: 'errPasswordMismatch' }
  }

  console.log('Signup attempt started (Verification Enabled) for:', email)

  // [중요] auth.signUp을 사용해야 Supabase가 자동으로 인증 메일을 발송함
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name,
        pixel_color: colors.primary,
        mood_id: moodId,
      },
      // 인증 후 돌아올 주소 (필요 시 설정)
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://pixelyf.com'}/auth/callback`,
    }
  })

  if (authError || !authData.user) {
    console.error('User signup failed:', authError)
    
    // [UX 개선] 에러 메시지 번역 키 반환
    if (authError?.message.includes('at least 6 characters')) {
      return { error: 'errPasswordTooShort' }
    }
    if (authError?.message.includes('already registered')) {
      return { error: 'errEmailAlreadyRegistered' }
    }
    
    return { error: `가입 실패: ${authError?.message || '인증 서비스 오류'}` }
  }

  const authUser = authData.user
  
  // 이미 가입된 유저인데 인증만 안 된 경우 처리 (Supabase 기본 동작 대응)
  if (authData.session === null && authUser.identities?.length === 0) {
    return { error: 'errEmailUnverifiedSignup' }
  }

  console.log('Auth user creation success, starting DB profile creation for:', authUser.id)

  // 데이터베이스에 초기 픽셀 좌표 및 컬러 할당
  try {
    // ── [가입 즉시 좌표 부여] ──
    // Phase 3: 루트 은하(PIXELYF) 단 1곳만 좌표를 생성하고, 나머지는 참여형으로 변경
    const PARTNER_CODE = 'pixelyf'
    const ROOT_GALAXY = { id: 'PIXELYF', x: 0, y: 0 }

    // 가입된 총 유저 수 조회 (순위 결정)
    // 신규 유저는 activity_score=0이므로 최하위 rank → 최외곽에 배치됩니다.
    // 다음 날 새벽 Batch에서 정밀 rank가 activity_score 기반으로 재계산됩니다.
    const totalUsers = await prisma.user.count()
    const rank = totalUsers + 1 // 본인의 가입 순위

    // ── [루트 은하 좌표 일괄 생성 (Phase 3)] ──
    const pos = calculatePosition(rank, ROOT_GALAXY.x, ROOT_GALAXY.y, totalUsers, ROOT_GALAXY.id, authUser.id)
    const coordsData = [{
      coordX: pos.x,
      coordY: pos.y,
      color: colors.primary,
      label: display_name,
      partnerCode: PARTNER_CODE,
      galaxyKey: ROOT_GALAXY.id,
    }]

    await prisma.user.create({
      data: {
        id: authUser.id,
        display_name,
        pixel_id: crypto.randomUUID(),
        google_uid: authUser.id,
        current_mood_id: moodId,
        feed_translation_languages: [...SUPPORTED_LOCALES],
        coordinates: {
          create: coordsData
        },
        persona: {
          create: {
            persona_code: 'STARTER',
            persona_name: '신규 픽셀리어',
            persona_color: colors.primary,
            glow_color_primary: colors.primary,
            glow_color_secondary: colors.secondary,
          }
        }
      }
    })
    console.log(`[SIGNUP] ${authUser.id} -> Root Coordinate Created (PIXELYF)`)
  } catch (dbError) {
    console.error('Initial pixel creation failed:', dbError)
    return { error: 'errProfileCreation' }
  }

  // [Resend 통합] Supabase Admin API로 인증 URL 생성 → Resend로 프리미엄 HTML 이메일 발송
  try {
    const adminClient = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pixelyf.com'
    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: { redirectTo: `${siteUrl}/auth/callback` }
    })

    if (linkData?.properties?.action_link) {
      await sendVerificationEmail(email, display_name, linkData.properties.action_link)
      console.log('[Resend] 프리미엄 인증 이메일 발송 성공:', email)
    }
  } catch (resendError) {
    // Resend 실패해도 Supabase 기본 이메일이 폴백으로 발송됨 → 가입 플로우 중단 없음
    console.error('[Resend] 이메일 발송 실패 (Supabase 폴백 유지):', resendError)
  }

  revalidatePath('/', 'layout')
  // [UX 개선] 전용 상태 파라미터 전달
  redirect('/auth/login?status=verify-email')
}

export async function logout() {
  console.log('Logout initiated at:', new Date().toISOString())
  const supabase = await createClient()
  
  // [보안] 서버 측 세션 확실히 종료
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    console.error('Logout error:', error.message)
  }

  console.log('Logout success, revalidating and redirecting...')
  
  // 전체 레이아웃 캐시 무효화 (상태 전이 충돌 방지)
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}
