'use client'

import { BarChart2, Zap, Users, FileText, LucideIcon } from 'lucide-react'

export type AnalyticsTabId = 'overview' | 'engagement' | 'audience' | 'content'

interface Tab {
  id: AnalyticsTabId
  label: string
  icon: LucideIcon
}

const TABS: Tab[] = [
  { id: 'overview', label: '개요', icon: BarChart2 },
  { id: 'engagement', label: '인터랙션', icon: Zap },
  { id: 'audience', label: '방문자', icon: Users },
  { id: 'content', label: '콘텐츠', icon: FileText },
]

interface AnalyticsTabsProps {
  activeTab: AnalyticsTabId
  onTabChange: (tab: AnalyticsTabId) => void
}

export default function AnalyticsTabs({ activeTab, onTabChange }: AnalyticsTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-white/10">
      {TABS.map(tab => {
        const isActive = activeTab === tab.id
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap
              transition-colors duration-200 border-b-2 -mb-px
              ${isActive
                ? 'text-white border-white'
                : 'text-white/50 border-transparent hover:text-white/80'
              }
            `}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
