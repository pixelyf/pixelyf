import React from 'react'
import { Star } from 'lucide-react'
import { PERSONA_MAP } from '@/shared/constants/personas'

interface PersonaBadgeProps {
  isStore?: boolean
  storeRating?: number
  reviewCount?: number
  personaCode?: string
  size?: 'sm' | 'md'
  transparentBg?: boolean // 소셜 연결 툴팁 등 투명 테두리 전용 스타일
}

export function PersonaBadge({
  isStore,
  storeRating,
  reviewCount,
  personaCode,
  size = 'sm',
  transparentBg = false
}: PersonaBadgeProps) {
  const isSm = size === 'sm'

  if (isStore && storeRating) {
    return (
      <span
        className={`shrink-0 rounded font-black border bg-amber-500/10 border-amber-500/30 text-amber-400 flex items-center gap-0.5 ${
          isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs rounded-md'
        }`}
        style={{ lineHeight: 1 }}
      >
        <Star className={`fill-amber-400 text-amber-400 shrink-0 ${isSm ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
        <span>{Number(storeRating || 4.0).toFixed(1)}</span>
        <span className="text-white/40 font-medium ml-0.5">({reviewCount || 0})</span>
      </span>
    )
  }

  if (personaCode && PERSONA_MAP[personaCode]) {
    const config = PERSONA_MAP[personaCode]
    return (
      <span
        className={`shrink-0 rounded font-bold border ${
          isSm ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-xs rounded-md'
        }`}
        style={{
          backgroundColor: transparentBg ? `${config.glowColorPrimary}15` : config.glowColorPrimary,
          borderColor: transparentBg ? `${config.glowColorPrimary}30` : config.glowColorPrimary,
          color: transparentBg ? config.glowColorPrimary : '#ffffff',
          lineHeight: 1,
        }}
      >
        {personaCode}
      </span>
    )
  }

  return null
}
