import { Suspense } from 'react'
import { PersonaCardGrid } from '../persona-card-grid'
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'

export default async function QuickOnboardingPage() {
  const t = await getTranslations('Onboarding')
  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-950 text-white px-4 py-12 pb-24">
      <div className="w-full max-w-5xl space-y-12">
        <header className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {t('quickPageTitle')}
            </h1>
            <p className="text-slate-400">
              {t('quickPageDesc')}
            </p>
          </div>
          <Link 
            href="/onboarding"
            className="text-slate-500 hover:text-white transition-colors text-sm border border-slate-800 px-4 py-2 rounded-full"
          >
            {t('goBack')}
          </Link>
        </header>

        <Suspense fallback={<div className="text-center text-slate-500 py-20">{t('loadingText')}</div>}>
          <PersonaCardGrid />
        </Suspense>

        <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-3xl text-center max-w-2xl mx-auto">
          <p className="text-slate-400 mb-2">{t('forgotPersonality')}</p>
          <Link 
            href="/onboarding/survey"
            className="text-emerald-400 font-medium hover:underline"
          >
            {t('retakeSurvey')}
          </Link>
        </div>
      </div>
    </div>
  )
}
