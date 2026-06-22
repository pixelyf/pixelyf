'use client'

import { useState } from 'react'
import { Eye, Zap, BookOpen, Users } from 'lucide-react'
import { AnalyticsData } from './useAnalyticsData'
import DeltaIndicator from './DeltaIndicator'
import Sparkline from './Sparkline'
import AnalyticsLineChart from './AnalyticsLineChart'

type MetricKey = 'visits' | 'interactions' | 'moments' | 'subscribers'

interface HeroCard {
  key: MetricKey
  label: string
  icon: typeof Eye
  getValue: (d: AnalyticsData) => number
  getPrevious: (d: AnalyticsData) => number | null
  getDailyData: (d: AnalyticsData) => { date: string; count: number }[]
}

const HERO_CARDS: HeroCard[] = [
  {
    key: 'visits',
    label: '총 방문',
    icon: Eye,
    getValue: d => d.visits?.total_visits ?? 0,
    getPrevious: d => d.previousPeriod?.visits ?? null,
    getDailyData: d => d.dailyVisits ?? [],
  },
  {
    key: 'interactions',
    label: '총 인터랙션',
    icon: Zap,
    getValue: d => (d.touches ?? 0) + (d.totalPings ?? 0) + (d.comments ?? 0) + (d.bonds ?? 0) + (d.subscriptions ?? 0),
    getPrevious: d => {
      if (!d.previousPeriod) return null
      return d.previousPeriod.touches + d.previousPeriod.pings
    },
    getDailyData: d => {
      // 터치 + 핑 일별 합산 (근사)
      const touches = d.dailyTouches ?? []
      const pings = d.dailyPings ?? []
      if (touches.length === 0) return pings
      return touches.map((t, i) => ({
        date: t.date,
        count: t.count + (pings[i]?.count ?? 0),
      }))
    },
  },
  {
    key: 'moments',
    label: '모먼트',
    icon: BookOpen,
    getValue: d => d.momentsCount ?? 0,
    getPrevious: d => d.previousPeriod?.moments ?? null,
    getDailyData: d => d.dailyMoments ?? [],
  },
  {
    key: 'subscribers',
    label: '구독자',
    icon: Users,
    getValue: d => d.subscriptions ?? 0,
    getPrevious: () => null,
    getDailyData: () => [],
  },
]

interface AnalyticsOverviewProps {
  data: AnalyticsData
}

export default function AnalyticsOverview({ data }: AnalyticsOverviewProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('visits')

  const selectedCard = HERO_CARDS.find(c => c.key === selectedMetric) ?? HERO_CARDS[0]
  const chartData = selectedCard.getDailyData(data)

  return (
    <div className="space-y-6">
      {/* Hero 메트릭 카드 */}
      <div className="grid grid-cols-2 gap-3">
        {HERO_CARDS.map(card => {
          const Icon = card.icon
          const value = card.getValue(data)
          const previous = card.getPrevious(data)
          const sparkData = card.getDailyData(data).map(d => d.count)
          const isSelected = selectedMetric === card.key

          return (
            <button
              key={card.key}
              onClick={() => setSelectedMetric(card.key)}
              className={`
                text-left p-4 rounded-2xl border transition-all duration-200
                ${isSelected
                  ? 'bg-white/10 border-white/15'
                  : 'bg-white/5 border-white/10 hover:bg-white/8'
                }
              `}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[10px] text-white/50 uppercase tracking-wider">{card.label}</span>
              </div>
              <div className="text-2xl font-black text-white mb-1">
                {value.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <DeltaIndicator current={value} previous={previous} />
                {sparkData.length >= 2 && (
                  <Sparkline data={sparkData} width={60} height={20} />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 메인 라인차트 */}
      {chartData.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-white/50 mb-3">
            {selectedCard.label} 추이
          </div>
          <AnalyticsLineChart data={chartData} height={200} />
        </div>
      )}

      {/* 오늘/어제 비교 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] text-white/50 mb-1">오늘</div>
          <div className="text-xl font-bold text-white">
            {(data.visits?.today_visits ?? 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">방문</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] text-white/50 mb-1">어제</div>
          <div className="text-xl font-bold text-white">
            {(data.visits?.yesterday_visits ?? 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">방문</div>
        </div>
      </div>
    </div>
  )
}
