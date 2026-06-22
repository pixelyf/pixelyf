import { createClient } from '@/shared/lib/supabase/server'
import { redirect } from 'next/navigation'
import prisma from '@/shared/lib/prisma'
import { PixelAnalyticsPanel } from '@/widgets/galaxy-canvas/PixelAnalyticsPanel'

export default async function UserAnalyticsPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id: targetId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // 1. 대상 픽셀 유저 정보 조회
  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      display_name: true,
      avatar_image_url: true,
      current_mood_id: true,
    }
  })

  if (!targetUser) {
    redirect('/')
  }

  return (
    <div className="w-full h-[100dvh] bg-[#020617]">
      <PixelAnalyticsPanel
        isOpen={true}
        userId={targetId}
        pixelName={targetUser.display_name || '픽셀리어'}
        moodId={targetUser.current_mood_id}
        isStandalone={true}
      />
    </div>
  )
}
