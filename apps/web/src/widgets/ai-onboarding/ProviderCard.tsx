'use client'

/**
 * [AI 프로바이더 카드 컴포넌트]
 * 온보딩 모달에서 프로바이더별 카드를 표시합니다.
 */

import type { AiProvider } from '@/shared/lib/ai/provider'

interface ProviderCardProps {
  provider: AiProvider
  isSelected: boolean
  isRecommended?: boolean
  onSelect: (provider: AiProvider) => void
}

const PROVIDER_CONFIG: Record<AiProvider, {
  name: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
  description: string
}> = {
  gemini: {
    name: 'Google Gemini',
    icon: '✦',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    description: '무료 크레딧 제공, 빠르고 정확한 응답',
  },
  openai: {
    name: 'OpenAI',
    icon: '◎',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    description: 'GPT-4o 기반, 창의적 대화에 강함',
  },
  anthropic: {
    name: 'Anthropic Claude',
    icon: '◈',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    description: '자연스러운 대화, 안전한 응답',
  },
}

export function ProviderCard({ provider, isSelected, isRecommended, onSelect }: ProviderCardProps) {
  const config = PROVIDER_CONFIG[provider]

  return (
    <button
      onClick={() => onSelect(provider)}
      className={`relative w-full p-4 rounded-2xl border-2 transition-all duration-300 text-left group
        ${isSelected
          ? 'bg-transparent border-white scale-[1.02]'
          : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
        }
      `}
    >
      <div className="flex items-center gap-3">
        {/* 아이콘 */}
        <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center text-lg ${config.color}`}>
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-white/70'}`}>
            {config.name}
          </div>
          <div className="text-xs text-white/40 mt-0.5">
            {config.description}
          </div>
        </div>

        {/* 체크 표시 */}
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
          ${isSelected
            ? 'border-white bg-transparent'
            : 'border-white/20'
          }
        `}>
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  )
}
