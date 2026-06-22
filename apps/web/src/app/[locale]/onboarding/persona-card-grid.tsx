'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { PERSONA_MAP, PersonaConfig } from '@/shared/constants/personas'
import { useTranslations } from 'next-intl'

export function PersonaCardGrid() {
  const t = useTranslations('Onboarding')
  const router = useRouter()
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSelectCard = (code: string) => {
    setSelectedCode(code)
  }

  const handleConfirm = async () => {
    if (!selectedCode || isSubmitting) return

    setIsSubmitting(true)

    try {
      // API call to select persona and set initial coordinates
      const res = await fetch('/api/onboarding/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mbtiCode: selectedCode }),
      })

      if (!res.ok) {
        throw new Error('Failed to save persona')
      }

      const { user: fullProfile } = await res.json()
      
      // Update global store immediately before redirecting
      const { useUserStore } = await import('@/entities/user/model/useUserStore')
      useUserStore.getState().setUser({
        id: fullProfile.id,
        email: fullProfile.google_uid,
        display_name: fullProfile.display_name,
        pixel_id: fullProfile.pixel_id,
        coordX: fullProfile.coordX,
        coordY: fullProfile.coordY,
        persona_code: fullProfile.persona_code,
        avatar_url: fullProfile.avatar_image_url
      })

      router.push('/')
    } catch (error) {
      console.error(error)
      setIsSubmitting(false)
      alert(t('personaSaveFailed'))
    }
  }

  const personaList = Object.values(PERSONA_MAP)

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {personaList.map((persona) => {
          const isSelected = selectedCode === persona.code
          return (
            <button
              key={persona.code}
              onClick={() => handleSelectCard(persona.code)}
              disabled={isSubmitting}
              className={`
                relative flex flex-col items-center justify-center p-5 rounded-2xl
                border transition-all duration-200 ease-out group overflow-hidden
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isSelected 
                  ? 'border-white bg-white text-black' 
                  : 'border-slate-800 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/50 text-slate-400 hover:text-white'}
              `}
            >
              {/* Flat circular container for the MBTI code */}
              <div
                className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center text-sm font-black transition-all duration-200
                  ${isSelected 
                    ? 'bg-black text-white border border-black' 
                    : 'bg-slate-950 text-slate-300 border border-slate-800/80 group-hover:border-slate-700'}
                `}
              >
                {persona.code}
              </div>

              <h3 className={`text-sm font-semibold transition-colors text-center
                ${isSelected ? 'text-black' : 'text-slate-300 group-hover:text-white'}
              `}>
                {persona.name}
              </h3>
              
              <p className={`text-xs mt-0.5 text-center
                ${isSelected ? 'text-slate-600' : 'text-slate-500'}
              `}>
                {persona.nebulaName}
              </p>
            </button>
          )
        })}
      </div>

      {/* 선택 확인 버튼 */}
      <div className="flex justify-center pt-4 px-4">
        <button
          onClick={handleConfirm}
          disabled={!selectedCode || isSubmitting}
          className={`
            inline-block w-full sm:min-w-[240px] sm:w-auto py-3.5 px-6 rounded-full font-bold text-sm transition-colors duration-200 text-center shadow-sm
            ${selectedCode 
              ? 'bg-white hover:bg-slate-100 text-black cursor-pointer shadow-lg' 
              : 'bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed opacity-50'}
          `}
        >
          {isSubmitting ? t('loadingText') : t('startNow')}
        </button>
      </div>
    </div>
  )
}
