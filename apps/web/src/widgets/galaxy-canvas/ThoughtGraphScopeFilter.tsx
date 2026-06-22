'use client'

/**
 * [생각그래프] 화면 B — 스코프 필터 (78번 §2)
 * 
 * 글라스모피즘 셸 및 이모지가 제거된 플랫 텍스트 탭 형태
 * [전체 은하 / 내 은하]
 */

import React from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useTranslations } from 'next-intl'
import { Globe, User } from 'lucide-react'

export function ThoughtGraphScopeFilter() {
  const t = useTranslations('Galaxy')
  const thoughtScope = useGalaxyStore(s => s.thoughtScope)
  const setThoughtScope = useGalaxyStore(s => s.setThoughtScope)
  const user = useUserStore(s => s.user)

  const scopes = [
    { key: 'all' as const, label: t('scopeAll'), id: 'btn-scope-all', disabled: false },
    { key: 'mine' as const, label: t('scopeMine'), id: 'btn-scope-mine', disabled: !user },
  ]

  return (
    <div data-tour="thought-graph-scope" className="pointer-events-auto flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-[0_4px_12px_rgba(0,0,0,0.5)] select-none gap-0.5">
      {scopes.map((scope) => {
        const isActive = thoughtScope === scope.key
        const isDisabled = scope.disabled
        const Icon = scope.key === 'all' ? Globe : User

        return (
          <button
            key={scope.key}
            id={scope.id}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return
              setThoughtScope(scope.key)
            }}
            className={`
              w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
              ${isDisabled
                ? 'opacity-20 cursor-not-allowed pointer-events-none'
                : isActive
                  ? 'bg-white text-black shadow-md font-black active:scale-95'
                  : 'text-white/40 hover:text-white/70 active:scale-95'
              }
            `}
            title={scope.label}
          >
            <Icon size={16} />
          </button>
        )
      })}
    </div>
  )
}
