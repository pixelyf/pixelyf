'use client'

import React from 'react'
import { motion } from 'framer-motion'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useGalaxyNavigation } from '@/shared/hooks/useGalaxyNavigation'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'

export function WarpController() {
  const currentGalaxy = useGalaxyStore((s) => s.galaxyKey)
  const { navigateToGalaxy } = useGalaxyNavigation()
  const { galaxies, isLoading } = useGalaxySystem()

  if (isLoading || !galaxies?.length) return null

  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut", delay: 0.5 }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-[40] pointer-events-auto"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        {galaxies.map((galaxy, idx) => {
          const IconName = (galaxy.icon || 'Globe') as keyof typeof LucideIcons
          const Icon = (LucideIcons[IconName] as LucideIcon) || LucideIcons.Globe
          const isActive = currentGalaxy === galaxy.key

          return (
            <React.Fragment key={galaxy.key}>
              {idx > 0 && <span className="text-white/20 text-xs">▶</span>}
              <button
                onClick={() => {
                  if (isActive) return
                  navigateToGalaxy(galaxy.key)
                }}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? 'bg-indigo-500/20 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-warp"
                    className="absolute inset-0 rounded-xl border border-indigo-500/50"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-300' : ''}`} />
                <span className={`text-sm font-bold tracking-tight ${isActive ? 'text-indigo-200' : ''}`}>
                  {galaxy.name}
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </motion.div>
  )
}

