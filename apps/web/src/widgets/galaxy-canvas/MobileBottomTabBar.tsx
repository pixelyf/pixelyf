'use client'

import React from 'react'
import { Plus } from 'lucide-react'

export function MobileBottomTabBar() {
  const handlePress = () => {
    window.dispatchEvent(new CustomEvent('OPEN_MOMENT_MODAL'))
  }

  return (
    <div className="fixed bottom-6 right-6 z-[60] pointer-events-auto">
      <button
        onClick={handlePress}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-[0_6px_20px_rgba(255,0,122,0.4)] active:scale-95 transition-all duration-200 border border-white/10 hover:border-white/20"
        style={{
          background: 'linear-gradient(135deg, var(--color-hot-magenta), #c026d3)',
        }}
        aria-label="기록하기"
      >
        <Plus color="#ffffff" size={28} strokeWidth={3} />
      </button>
    </div>
  )
}
