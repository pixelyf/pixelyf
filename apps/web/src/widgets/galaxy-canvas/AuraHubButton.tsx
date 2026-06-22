'use client'

import { useState, useEffect, useRef } from 'react'
import { MomentModal } from './MomentModal'
import { MOODS, MoodType } from '@/shared/constants/moods'
import { Plus, CalendarDays } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useTranslations } from 'next-intl'
import { MoodHistoryDrawer } from '../mood-history/MoodHistoryDrawer'
import { mutate } from 'swr'

export function AuraHubButton() {
  const t = useTranslations('Galaxy')
  const tMood = useTranslations('Moods')
  const currentMoodId = useGalaxyStore(s => s.currentMoodId)
  const setMood = useGalaxyStore(s => s.setMood)
  const user = useUserStore(s => s.user)
  const setUser = useUserStore(s => s.setUser)
  const [isOpen, setIsOpen] = useState(false)
  const [isMomentOpen, setIsMomentOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // [FIX] 초기 로그인 시 DB에 저장된 무드 ID를 스토어에 동기화
  // Rules of Hooks: useEffect는 early return 앞에 위치해야 함
  useEffect(() => {
    if (user?.current_mood_id && user.current_mood_id !== currentMoodId) {
      setMood(user.current_mood_id)
    }
  }, [user?.current_mood_id, currentMoodId, setMood])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // [FIX] 비로그인 상태에서는 컨트롤 센터를 노출하지 않음 (모든 Hook 호출 이후)
  if (!user) return null

  const selected = MOODS.find(m => m.id === currentMoodId) ?? MOODS[0]

  const handleAuraSelect = async (mood: MoodType) => {
    // 1. 즉각적인 UI 반영 (Galaxy Store)
    setMood(mood.id)
    setIsOpen(false)
    
    // 2. Sync to DB
    try {
      const res = await fetch('/api/users/aura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moodId: mood.id,
          localDate: new Date().toLocaleDateString('sv-SE'), // 'YYYY-MM-DD' (ISO)
        }),
      })

      if (res.ok && user) {
        // 3. [FIX]: DB 업데이트 성공 시 User Store도 즉시 업데이트
        // 이를 통해 useEffect(user?.current_mood_id)가 이전 값으로 리버트하는 것을 방지
        console.log(`[AuraHub] Mood Update Success: ${mood.label}`);
        setUser({ ...user, current_mood_id: mood.id })
        
        // 내 생각 그래프(Mood History) 캐시 무효화하여 최신 상태 즉시 반영
        mutate(
          (key) => typeof key === 'string' && key.startsWith('/api/users/mood-history'),
          undefined,
          { revalidate: true }
        )
      }
    } catch (e) {
      console.error('Failed to sync aura:', e)
    }
  }

  return (
    <>
      {/* 픽셀 상태 제어 센터 (하단 중앙) */}
      <div 
        ref={containerRef}
        data-tour="aura-hub"
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[30] pointer-events-auto flex flex-col items-center gap-4 w-full max-w-[90vw] sm:max-w-md"
      >

        {/* 30종 기분 그리드 선택창 (펼쳤을 때 노출) */}
        {isOpen && (
          <div className="relative w-full rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-500 group/hub">
            {/* [PREMIUM] Animated Glassmorphism Glow Border */}
            <div className="absolute -inset-[1px] bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-pink-500/30 rounded-[2.5rem] blur-sm opacity-50 group-hover/hub:opacity-100 transition-opacity duration-1000" />
            <div className="relative w-full bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 flex flex-col gap-6 max-h-[60vh] overflow-hidden">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">{t('todayMoodStatus')}</h3>
                <span className="text-[10px] text-indigo-400 font-bold bg-indigo-400/10 px-2 py-0.5 rounded-full">12 Auras</span>
              </div>
              
              <div className="grid grid-cols-4 gap-4 overflow-y-auto pr-2 custom-scrollbar pb-4">
              {MOODS.map((mood, index) => (
                <button
                  key={mood.id}
                  onClick={() => handleAuraSelect(mood)}
                  className={`flex flex-col items-center gap-2 group transition-all duration-300 py-3 rounded-2xl animate-in slide-in-from-bottom-4 fade-in ${currentMoodId === mood.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  style={{ animationFillMode: 'both', animationDelay: `${index * 25}ms`, animationDuration: '400ms' }}
                >
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${mood.colorClass} flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-transform group-hover:scale-110 active:scale-95
                    ${currentMoodId === mood.id ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-105' : 'opacity-80 group-hover:opacity-100'}`}>
                    {(() => {
                      const MoodIcon = mood.icon;
                      return <MoodIcon size={26} className="text-white drop-shadow-md" />;
                    })()}
                  </div>
                  <span className={`text-[11px] font-bold transition-colors truncate w-full text-center px-1 ${currentMoodId === mood.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    {tMood(mood.id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          </div>
        )}


        {/* 메인 컨트롤 로우 */}
        <div className="flex items-center gap-4">
          {/* 현재 기분 상태 캡슐 */}
          <div
            data-tour="aura-capsule"
            className="group flex items-center gap-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-6 py-2.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] cursor-pointer hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all duration-400"
            onClick={() => setIsOpen(v => !v)}
          >
            <div className={`shrink-0 w-9 h-9 rounded-full bg-gradient-to-br ${selected.colorClass} flex items-center justify-center shadow-inner overflow-hidden border border-white/20`}>
              {(() => {
                const SelectedIcon = selected.icon;
                return <SelectedIcon size={18} className="text-white group-hover:scale-125 transition-transform duration-500" />;
              })()}
            </div>
            <div className="flex items-center gap-1.5 pr-2">
              <span className="text-[13px] font-medium text-white/50 tracking-tight">{t('myMoodStatus')}</span>
              <span className={`text-[14px] font-bold tracking-tight bg-gradient-to-br ${selected.colorClass} bg-clip-text text-transparent`}>{tMood(selected.id)}</span>
            </div>
          </div>

        {/* 기분 히스토리 버튼 */}
        <button
          data-tour="btn-mood-history"
          onClick={() => { setIsOpen(false); setIsHistoryOpen(true) }}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all duration-500 transform hover:scale-105 active:scale-95"
          aria-label="Mood History"
        >
          <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 blur opacity-0 group-hover:opacity-100 transition-opacity" />
          <CalendarDays size={24} className="text-white group-hover:rotate-12 transition-transform duration-500 font-light" />
        </button>

        {/* 모먼트 작성 버튼 (+) — 정원 */}
        <button
          data-tour="btn-create-moment"
          onClick={() => { setIsOpen(false); setIsMomentOpen(true) }}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all duration-500 transform hover:scale-105 active:scale-95"
          aria-label="New Moment"
        >
          <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-emerald-500/10 to-blue-500/10 blur opacity-0 group-hover:opacity-100 transition-opacity" />
          <Plus size={28} className="text-white group-hover:rotate-90 transition-transform duration-500 font-light" />
        </button>
      </div>
      </div>

      <MomentModal isOpen={isMomentOpen} onClose={() => setIsMomentOpen(false)} />
      <MoodHistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </>
  )
}
