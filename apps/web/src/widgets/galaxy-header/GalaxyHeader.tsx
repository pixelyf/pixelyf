'use client'

import React from 'react'
import { Search, Globe, ChevronDown, Rocket } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Logo } from '@/shared/ui/Logo'
import { LogoText } from '@/shared/ui/LogoText'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function GalaxyHeader() {

  return (
    <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-6xl pointer-events-none">
      <div className={cn(
        "glass rounded-none px-6 py-3 flex items-center justify-between pointer-events-auto",
        "border-slate-edge"
      )}>
        {/* Logo & Galaxy Switcher Anchor */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 group cursor-pointer">
            <Logo size="md" className="group-hover:scale-110 transition-transform scale-90 sm:scale-100 hidden sm:block" />
            <Logo size="md" className="group-hover:scale-110 transition-transform scale-90 sm:hidden" animate={false} />
            <LogoText size="sm" className="hidden sm:flex" />
          </div>
          
          <div className="h-6 w-[1px] bg-white/10 mx-1 sm:mx-2" />
          
          <button 
            onClick={() => { console.log('Switcher clicked') }}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <span className="hidden sm:block text-sm font-semibold text-white/70 group-hover:text-white transition-colors">Sentiment Galaxy</span>
            <span className="sm:hidden text-xs font-semibold text-white/70">Galaxy</span>
            <ChevronDown className="w-4 h-4 text-white/40 group-hover:text-white/80" />
          </button>
        </div>

        {/* Search Engine */}
        <div className="flex-1 max-w-md mx-4 sm:mx-8 hidden md:block">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-neon-blue transition-colors" />
            <input 
              type="text" 
              placeholder="Search user or galaxy..."
              className="w-full bg-white/5 border border-slate-edge rounded-none py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-hot-magenta/50 focus:bg-white/10 transition-all font-light"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-3">
          <button className="p-2 rounded-xl hover:bg-white/5 transition-colors text-white/60 hover:text-white">
            <Globe className="w-5 h-5 scale-90 sm:scale-100" />
          </button>
          
          <button className={cn(
            "px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all duration-300",
            "bg-hot-magenta/10 border border-hot-magenta/30 text-hot-magenta hover:bg-hot-magenta hover:text-white"
          )}>
            Connect
          </button>
        </div>
      </div>
    </header>
  )
}
