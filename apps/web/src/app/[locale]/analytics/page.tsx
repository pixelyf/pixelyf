import { createClient } from '@/shared/lib/supabase/server'
import { redirect } from 'next/navigation'
import prisma from '@/shared/lib/prisma'
import AnalyticsDashboard from '@/widgets/analytics/AnalyticsDashboard'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // 현재 유저의 mood_id 조회 (theme-panel-bg 배경용)
  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: { current_mood_id: true },
  })

  return (
    <AnalyticsDashboard 
      userId={user.id} 
      moodId={userData?.current_mood_id} 
    />
  )
}
