'use client'

import { useRouter } from '@/i18n/navigation'
import { SettingsModal } from '@/widgets/galaxy-canvas/SettingsModal'

export default function SettingsInterceptedPage() {
  const router = useRouter()

  return (
    <SettingsModal 
      isOpen={true} 
      onClose={() => router.back()} 
    />
  )
}
