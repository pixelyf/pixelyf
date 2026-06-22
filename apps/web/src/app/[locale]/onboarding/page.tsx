import { Suspense } from 'react'
import { PersonaCardGrid } from './persona-card-grid'
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'

export default async function OnboardingPage() {
  const t = await getTranslations('Onboarding')
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white px-4 py-16 pb-24 selection:bg-slate-800">
      <div className="w-full max-w-5xl space-y-12">
        {/* Simplified and Centered Header (Anti-Flashy) */}
        <header className="text-center space-y-3 max-w-2xl mx-auto">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
            {t('quickPageTitle')}
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            {t('quickPageDesc')}
          </p>
        </header>

        {/* 1-Step: Direct Selection Card Grid */}
        <main className="w-full">
          <Suspense fallback={<div className="text-center text-slate-500 py-16">{t('loadingText')}</div>}>
            <PersonaCardGrid />
          </Suspense>
        </main>

        {/* 2-Step: Soft Survey Nudge (Pure White Flat Button Style) */}
        <footer className="text-center max-w-xl mx-auto pt-8 border-t border-slate-900 px-4">
          <p className="text-slate-500 text-sm mb-3">
            {t('forgotPersonality')}
          </p>
          <Link 
            href="/onboarding/survey"
            className="inline-block w-full sm:min-w-[240px] sm:w-auto py-3.5 px-6 rounded-full bg-white hover:bg-slate-100 text-black font-bold text-sm transition-colors text-center shadow-sm"
          >
            {t('retakeSurvey')}
          </Link>
        </footer>
      </div>
    </div>
  )
}
