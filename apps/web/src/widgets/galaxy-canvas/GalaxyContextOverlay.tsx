'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/shared/lib/supabase/browser'
import { ShieldCheck, Sparkles, TrendingUp, Globe, Activity } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * [은하 전용 맥락 오버레이]
 * - 성단 내 실시간 동기화 지수 및 맥락 지표 시각화.
 * - 유리질(Glassmorphism) 기반의 프리미엄 디자인.
 */
export function GalaxyContextOverlay() {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 500)
    return () => clearTimeout(timer)
  }, [])


  return (
    <div className="absolute inset-0 z-[35] pointer-events-none overflow-hidden">
      <AnimatePresence>
        {isLoaded && (
          <>


            {/* ── 배경 장식: 맥락 오라 입자 ── */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-20 pointer-events-none">
               <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] animate-pulse" />
               <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[150px] animate-pulse [animation-delay:2s]" />
            </div>

          </>
        )}
      </AnimatePresence>
    </div>
  )
}

