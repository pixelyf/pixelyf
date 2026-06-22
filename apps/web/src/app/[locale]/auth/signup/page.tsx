'use client'

import { useState } from 'react'
import { signup } from '@/shared/lib/auth/actions'
import { Sparkles, Mail, Lock, ArrowLeft, User, ShieldCheck } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { LogoText } from '@/shared/ui/LogoText'
import { MOODS, getMoodColors } from '@/shared/constants/moods'
import { useTranslations } from 'next-intl'
import { createClient } from '@/shared/lib/supabase/browser'

export default function SignupPage() {
  const t = useTranslations('Auth')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getLocalizedError = (errorKey: string) => {
    const knownKeys = [
      'errPasswordMismatch',
      'errEmailNotConfirmed',
      'errPasswordTooShort',
      'errEmailAlreadyRegistered',
      'errEmailUnverifiedSignup',
      'errProfileCreation'
    ]
    if (knownKeys.includes(errorKey)) {
      return t(`errors.${errorKey}`)
    }
    return errorKey
  }

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError(null)

    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirm_password') as string

    if (password !== confirmPassword) {
      setError(t('errors.errPasswordMismatch'))
      setIsLoading(false)
      return
    }
    
    const result = await signup(formData)
    
    if (result?.error) {
      setError(getLocalizedError(result.error))
      setIsLoading(false)
    }
  }

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'kakao' | 'naver') => {
    if (provider !== 'google') {
      alert('다른 소셜 로그인은 준비중입니다.')
      return
    }

    setIsLoading(true)
    setError(null)
    console.log(`Triggering social signup for ${provider}...`)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'select_account',
          },
        }
      })

      if (error) {
        throw error
      }
    } catch (e: any) {
      console.error(`Social signup error for ${provider}:`, e)
      setError(e.message || t('loginError'))
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden font-sans text-slate-200">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[var(--color-hot-magenta)]/5 blur-[120px] rounded-full" />
      
      <div className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <Link href="/auth/login" className="inline-flex items-center gap-2 text-[var(--color-hot-magenta)] hover:opacity-80 text-xs font-bold mb-6 transition-colors group">
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            {t('backToLogin')}
          </Link>
          <div className="select-none flex justify-center mb-2">
            <LogoText size="md" className="justify-center items-center" />
          </div>
          <p className="text-slate-400 text-sm mt-1">{t('signupSubtitle')}</p>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-3xl p-8 shadow-2xl">
          <form action={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Nickname</label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[var(--color-hot-magenta)] transition-colors" />
                <input 
                  name="display_name"
                  type="text" 
                  required
                  autoComplete="nickname"
                  placeholder={t('personaNamePlaceholder')}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-hot-magenta)]/40 focus:border-[var(--color-hot-magenta)]/50 transition-all placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-bold text-slate-400 uppercase ml-1">PIXEL COLOR ({t('pixelColor')})</label>
              <div className="grid grid-cols-6 gap-y-7 gap-x-2 bg-slate-950/30 p-5 px-3 rounded-2xl border border-slate-800/50 pb-10">
                {MOODS.map((mood) => {
                  const colors = getMoodColors(mood.id);
                  return (
                    <label key={mood.id} className="relative group cursor-pointer" title={mood.label}>
                      <input 
                        type="radio" 
                        name="pixel_color" 
                        value={mood.id} 
                        required
                        className="peer sr-only" 
                      />
                      <div className="w-full aspect-square rounded-xl border-2 border-transparent peer-checked:border-white/80 peer-checked:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-300 flex items-center justify-center overflow-hidden bg-slate-900/50" 
                           style={{ backgroundColor: `${colors.primary}11` }}>
                        <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-transform group-hover:scale-125" 
                             style={{ backgroundColor: colors.primary }} />
                      </div>
                      <div className="absolute inset-x-0 -bottom-6 text-center">
                        <span className="text-[10px] font-bold text-slate-500 peer-checked:text-[var(--color-hot-magenta)] transition-colors whitespace-nowrap">
                          {mood.label}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[var(--color-hot-magenta)] transition-colors" />
                <input 
                  name="email"
                  type="email" 
                  required
                  autoComplete="email"
                  placeholder="name@example.com"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-hot-magenta)]/40 focus:border-[var(--color-hot-magenta)]/50 transition-all placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[var(--color-hot-magenta)] transition-colors" />
                <input 
                  name="password"
                  type="password" 
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-hot-magenta)]/40 focus:border-[var(--color-hot-magenta)]/50 transition-all placeholder:text-slate-600"
                />
              </div>
              <p className="text-[10px] text-slate-500 ml-1">{t('passwordMinLength')}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Confirm Password</label>
              <div className="relative group">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[var(--color-hot-magenta)] transition-colors" />
                <input 
                  name="confirm_password"
                  type="password" 
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-hot-magenta)]/40 focus:border-[var(--color-hot-magenta)]/50 transition-all placeholder:text-slate-600"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs py-3 px-4 rounded-xl">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="group relative w-full overflow-hidden rounded-2xl border border-slate-800/50 bg-slate-800/20 py-4 font-medium text-white transition-all duration-300 hover:border-slate-700 hover:bg-slate-700/30 active:scale-[0.98] disabled:opacity-50"
            >
              {/* Glassmorphic background layer */}
              <div className="absolute inset-0 bg-white/[0.03] transition-opacity group-hover:opacity-100" />
              
              <div className="relative flex items-center justify-center gap-3">
                {isLoading ? (
                  <LogoSpinner size={20} />
                ) : (
                  <>
                    <span className="text-slate-200 transition-colors group-hover:text-white">
                      {t('createAnonymousAccount')}
                    </span>
                    <Sparkles className="w-4 h-4 text-[var(--color-hot-magenta)]/80 transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110 group-hover:text-[var(--color-hot-magenta)]" />
                  </>
                )}
              </div>

              {/* Subtle inner glow matching the mood box style */}
              <div className="absolute inset-x-0 bottom-0 h-px w-full bg-gradient-to-r from-transparent via-[var(--color-hot-magenta)]/40 to-transparent transition-opacity duration-300 opacity-0 group-hover:opacity-100" />
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800/80" />
            </div>
            <span className="relative px-3 bg-[#020617] text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {t('or')}
            </span>
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-2.5">
            {/* Google */}
            <button
              onClick={() => handleSocialLogin('google')}
              disabled={isLoading}
              className="w-full bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed font-bold py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all text-xs border border-slate-200 shadow-sm active:scale-[0.98]"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.24 1 3.2 3.73 1.24 7.74l3.84 2.98C6.01 7.29 8.77 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.48-1.12 2.73-2.37 3.58l3.69 2.86c2.16-1.99 3.43-4.92 3.43-8.54z" />
                <path fill="#FBBC05" d="M5.08 10.72c-.25-.74-.39-1.53-.39-2.34s.14-1.6.39-2.34L1.24 3.09C.45 4.67 0 6.44 0 8.38c0 1.94.45 3.71 1.24 5.29l3.84-2.95z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.69-2.86c-1.12.75-2.55 1.19-4.27 1.19-3.23 0-5.99-2.25-6.92-5.28L1.24 16.1C3.2 20.1 7.24 23 12 23z" />
              </svg>
              {t('loginWithGoogle')}
            </button>

            {/* 다른 소셜 로그인(Apple, Kakao, Naver)은 개발 단계로 주석 처리
            <button
              onClick={() => handleSocialLogin('apple')}
              disabled={isLoading}
              className="w-full bg-black hover:bg-slate-950 text-white disabled:opacity-50 disabled:cursor-not-allowed font-bold py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all text-xs border border-slate-900 active:scale-[0.98]"
            >
              <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 170 170">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.24-1.92-14.67-6.13-3.79-3.03-7.74-7.85-11.83-14.47-8.62-14-12.93-29.21-12.93-45.65 0-14.55 3.91-26.74 11.73-36.56 7.82-9.82 17.51-14.78 29.07-14.88 5.25.13 10.74 1.76 16.48 4.88 5.73 3.13 9.87 4.69 12.4 4.69 2.01 0 6.09-1.45 12.24-4.34 6.15-2.88 11.86-4.3 17.15-4.24 13.79.62 24.58 5.63 32.39 15.01-11.4 6.94-17.01 16.48-16.82 28.61.2 9.88 3.82 18.06 10.87 24.54 7.05 6.49 15.35 10.05 24.9 10.69-.94 2.87-1.89 5.56-2.84 8.08zM119.22 19.01c0 7.18-2.6 13.97-7.8 20.35-5.2 6.38-11.77 10.23-19.72 11.55-.13-1.06-.2-2.12-.2-3.17 0-6.94 2.68-13.88 8.05-20.82 5.37-6.94 11.96-10.96 19.78-12.06.63 2.37.89 4.1.89 4.15z"/>
              </svg>
              Apple 로그인
            </button>

            <button
              onClick={() => handleSocialLogin('kakao')}
              disabled={isLoading}
              className="w-full bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] disabled:opacity-50 disabled:cursor-not-allowed font-bold py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all text-xs border border-[#FEE500] active:scale-[0.98]"
            >
              <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.528 1.684 4.75 4.225 5.92-.178.653-.642 2.36-.734 2.73-.112.455.163.45.342.33 1.408-.94 2.65-1.802 3.123-2.124.646.096 1.33.148 2.044.148 4.97 0 9-3.186 9-7.116C21 6.185 16.97 3 12 3z" />
              </svg>
              Kakao 로그인
            </button>

            <button
              onClick={() => handleSocialLogin('naver')}
              disabled={isLoading}
              className="w-full bg-[#03C75A] hover:bg-[#02B351] text-white disabled:opacity-50 disabled:cursor-not-allowed font-bold py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all text-xs border border-[#03C75A] active:scale-[0.98]"
            >
              <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                <path d="M16.2 3H21v18h-4.8l-8.4-12v12H3V3h4.8l8.4 12V3z" />
              </svg>
              Naver 로그인
            </button>
            */}
          </div>
        </div>
      </div>
    </div>
  )
}
