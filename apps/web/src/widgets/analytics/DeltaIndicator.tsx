'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface DeltaIndicatorProps {
  current: number
  previous: number | null | undefined
  className?: string
}

export default function DeltaIndicator({ current, previous, className = '' }: DeltaIndicatorProps) {
  if (previous === null || previous === undefined) {
    return <span className={`text-[10px] text-white/30 ${className}`}>—</span>
  }

  const delta = previous === 0
    ? (current > 0 ? 100 : 0)
    : Math.round(((current - previous) / previous) * 1000) / 10

  if (delta === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] text-white/40 ${className}`}>
        <Minus className="w-3 h-3" />
        0%
      </span>
    )
  }

  const isUp = delta > 0

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${isUp ? 'text-emerald-400' : 'text-rose-400'} ${className}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{delta}%
    </span>
  )
}
