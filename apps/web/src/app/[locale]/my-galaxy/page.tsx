import { createClient } from '@/shared/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'

export default async function MyGalaxyPage() {
  const t = await getTranslations('MyGalaxy')
  const tCommon = await getTranslations('Common')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // [Method B] UI 테스트를 위해 서버 컴포넌트 인증 체크 해제
  // if (!user) {
  //   redirect('/login')
  // }

  // const { data: userData } = await supabase
  //   .from('users')
  //   .select('*')
  //   .eq('id', user.id)
  //   .single()
  const userData = { activity_score: 999 } // Mock data

  // MVP mock moments since we lack local DB records to test
  const mockMoments = [
    { id: '1', content: '오늘 진짜 너무 피곤했다...', createdAt: '2026-03-21T10:00:00Z', aura: 'GLOOMY' },
    { id: '2', content: '커피 한 잔의 여유', createdAt: '2026-03-20T14:30:00Z', aura: 'CALM' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 sm:p-12 pb-24">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="flex justify-between items-end border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">{t('myGalaxy')}</h1>
            <p className="text-slate-400 mt-2">{t('activityScore', { score: userData?.activity_score || 0 })}</p>
          </div>
          <Link href="/" className="px-5 py-2 rounded-full border border-slate-700 bg-slate-800/50 hover:bg-slate-700 transition text-sm sm:text-base">
            {t('backToGalaxy')}
          </Link>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Timeline Section */}
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">{t('pastRecords')}</h2>
            <div className="space-y-4">
              {mockMoments.map(m => (
                <div key={m.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-slate-200">{m.content}</p>
                  <div className="flex justify-between items-center mt-4 text-xs text-slate-500">
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                    <span className="px-2 py-1 bg-slate-800 rounded-full">{m.aura}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Settings Section */}
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">{t('accountSettings')}</h2>
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">{t('accountEmail')}</label>
                <div className="p-3 bg-slate-950 rounded-lg text-slate-300 font-mono text-sm">
                  {user?.email || 'testuser@pixelyf.com'}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800">
                <h3 className="text-rose-500 font-semibold mb-2">{t('dangerZone')}</h3>
                <p className="text-sm text-slate-400 mb-4">
                  {t('dangerWarning')}
                </p>
                <form action="/api/auth/signout" method="POST">
                  <button type="submit" className="px-4 py-2 border border-slate-700 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition mr-4">
                    {tCommon('logout')}
                  </button>
                  <button type="button" className="px-4 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition">
                    {t('bigBang')}
                  </button>
                </form>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
