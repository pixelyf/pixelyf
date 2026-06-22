'use client'

import { useRouter } from '@/i18n/navigation'
import { SettingsModal } from '@/widgets/galaxy-canvas/SettingsModal'

export default function SettingsPage() {
  const router = useRouter()

  return (
    <div className="w-full h-[100dvh] bg-[#020617] flex items-center justify-center">
      <SettingsModal 
        isOpen={true} 
        onClose={() => router.push('/')} 
      />
    </div>
  )
}
