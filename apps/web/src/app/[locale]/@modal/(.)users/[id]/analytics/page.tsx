'use client'

import React, { use } from 'react'
import { useRouter } from '@/i18n/navigation'
import { PixelAnalyticsPanel } from '@/widgets/galaxy-canvas/PixelAnalyticsPanel'

export default function UserAnalyticsInterceptPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const resolvedParams = use(params)
  const targetId = resolvedParams.id

  return (
    <PixelAnalyticsPanel
      isOpen={true}
      onClose={() => router.back()}
      userId={targetId}
    />
  )
}
