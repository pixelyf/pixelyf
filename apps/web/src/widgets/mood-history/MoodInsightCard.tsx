'use client'

import { useEffect, useRef } from 'react'
import { motion, useSpring, LayoutGroup } from 'framer-motion'
import { MOODS, getMoodColors, LEGACY_ID_MAP } from '@/shared/constants/moods'
import { useTranslations } from 'next-intl'

interface Props {
  stats: {
    dominant_mood: string
    breakdown: Record<string, number>
    total_recorded_days: number
  }
  range?: 'day' | 'week' | 'month' | 'year'
}

// ── 숫자가 롤링되는 애니메이션 컴포넌트 ──
function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  // 고무줄처럼 쫀득하게 따라가는 spring 설정
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 })

  useEffect(() => {
    spring.set(value)
  }, [value, spring])

  useEffect(() => {
    return spring.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = Math.round(latest).toString()
      }
    })
  }, [spring])

  return <span ref={ref}>{value}</span>
}

export function MoodInsightCard({ stats, range = 'day' }: Props) {
  const tH = useTranslations('MoodHistory')
  const tMood = useTranslations('Moods')
  // 1. 모든 무드(12종)를 리스트업하고 각각의 퍼센티지를 계산
  const chartData = MOODS.map((mood) => {
    const count = stats.breakdown[mood.id] || 0
    const percentage = stats.total_recorded_days > 0 
      ? Math.round((count / stats.total_recorded_days) * 100) 
      : 0
    const colors = getMoodColors(mood.id)

    return {
      id: mood.id,
      name: colors.label,
      value: count,
      percentage,
      color: colors.primary,
      icon: colors.icon
    }
  })
  // 2. 비율이 높은 순서대로 내림차순 정렬 (framer-motion이 이 순서 변화를 감지해 스와핑 애니메이션 수행)
  .sort((a, b) => b.value - a.value)

  // 범위 라벨링
  const rangeLabelKey = range === 'day' ? 'rangeDay' : range === 'week' ? 'rangeWeek' : range === 'month' ? 'rangeMonth' : 'rangeYear'
  const rangeLabel = tH(rangeLabelKey)

  const effectiveDominantMood = LEGACY_ID_MAP[stats.dominant_mood] || stats.dominant_mood
  const dominantColors = getMoodColors(effectiveDominantMood)
  const dominantPercentage = stats.total_recorded_days > 0 
    ? Math.round(((stats.breakdown[stats.dominant_mood] || stats.breakdown[effectiveDominantMood] || 0) / stats.total_recorded_days) * 100) 
    : 0

  return (
    <div className="flex flex-col gap-6">
      {/* ── 1. 가장 높은 비중의 생각 하이라이트 (Dominant) ── */}
      <div className="relative overflow-hidden rounded-[2rem] bg-black/40 border border-white/10 p-6 shadow-2xl backdrop-blur-xl">
        {/* 맥동하는 배경 오라 글로우 (Breathing Aura Glow) */}
        <motion.div 
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.25, scale: [1, 1.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-[60px] pointer-events-none"
          style={{ backgroundColor: dominantColors.primary }}
        />
        
        <div className="flex items-center justify-between relative z-10">
          <div>
            <p className="text-xs text-white/80 font-bold uppercase tracking-widest">{tH('rangeDominant', { range: rangeLabel })}</p>
            <div className="flex items-end gap-2 mt-1">
              <motion.h3 
                layout="position"
                className="text-3xl font-black tracking-tight"
                style={{ color: dominantColors.primary, textShadow: `0 0 20px ${dominantColors.primary}80` }}
              >
                {tMood(effectiveDominantMood)}
              </motion.h3>
              <span className="text-white/70 text-sm mb-1.5 font-bold">
                (<AnimatedNumber value={dominantPercentage} />%)
              </span>
            </div>
          </div>
          
          <motion.div 
            layout
            className="w-14 h-14 rounded-full flex items-center justify-center bg-white/5 border border-white/10 shadow-inner relative"
          >
            <div className="absolute inset-0 rounded-full mix-blend-overlay opacity-50" style={{ backgroundImage: 'radial-gradient(circle at center, white 0%, transparent 70%)' }} />
            {(() => {
              const Icon = dominantColors.icon
              return <Icon size={28} style={{ color: dominantColors.primary, filter: `drop-shadow(0 0 8px ${dominantColors.primary}80)` }} />
            })()}
          </motion.div>
        </div>
      </div>

      {/* ── 2. 전체 통계 유체 바 그래프 (Liquid Nebula Bars) ── */}
      <div className="bg-black/30 border border-white/10 rounded-[2rem] p-6 shadow-2xl flex flex-col gap-6 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white/70 uppercase tracking-widest">{tH('totalDistribution', { count: stats.total_recorded_days })}</h4>
        </div>
        
        <LayoutGroup>
          <div className="space-y-4">
            {chartData.map((item, index) => {
              const Icon = item.icon
              const isZero = item.percentage === 0
              const isDominant = index === 0 && !isZero

              return (
                <motion.div 
                  layout="position" // 순위 스와핑 레이아웃 애니메이션
                  key={item.id} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 30,
                    layout: { type: "spring", stiffness: 100, damping: 15 } // 부드러운 스와핑
                  }}
                  className={`flex flex-col gap-2 relative ${isZero ? 'opacity-40 grayscale-[50%]' : 'opacity-100'}`}
                >
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2">
                      <Icon size={14} style={{ color: isZero ? '#94a3b8' : item.color }} />
                      <span className={`font-bold ${isZero ? 'text-white/70' : 'text-white'}`}>{tMood(item.id)}</span>
                    </div>
                    <span className={`font-bold ${isZero ? 'text-white/55' : 'text-white/90'}`}>
                      <AnimatedNumber value={item.percentage} />%
                    </span>
                  </div>
                  
                  {/* Progress Bar Track */}
                  <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 relative">
                    {/* Progress Bar Fill (Liquid Glow) */}
                    <motion.div 
                      layout="size"
                      initial={{ width: 0 }}
                      animate={{ width: `${item.percentage}%` }}
                      transition={{ type: "spring", mass: 0.8, stiffness: 75, damping: 15 }} // 탄성 물리 엔진 적용
                      className="absolute left-0 top-0 bottom-0 h-full rounded-full"
                      style={{ 
                        backgroundColor: item.color,
                        boxShadow: isZero ? 'none' : `0 0 15px ${item.color}80, inset 0 0 8px rgba(255,255,255,0.3)`
                      }}
                    >
                      {/* 움직이는 유체(액체) 그라데이션 질감 */}
                      {!isZero && (
                        <motion.div 
                          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
                          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                          className="w-full h-full opacity-30 mix-blend-overlay"
                          style={{
                            background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)`,
                            backgroundSize: '200% 100%'
                          }}
                        />
                      )}
                    </motion.div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </LayoutGroup>
      </div>
    </div>
  )
}

export function MoodInsightSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full animate-pulse">
      {/* Top Card Skeleton */}
      <div className="relative overflow-hidden rounded-[2rem] bg-black/40 border border-white/5 p-6 h-[116px]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2 mt-1">
            <div className="h-3 w-20 bg-white/10 rounded-full" />
            <div className="h-8 w-32 bg-white/10 rounded-full mt-2" />
          </div>
          <div className="w-14 h-14 rounded-full bg-white/10" />
        </div>
      </div>

      {/* Bottom Card Skeleton */}
      <div className="bg-black/30 border border-white/5 rounded-[2rem] p-6 flex flex-col gap-6">
        <div className="h-3 w-24 bg-white/10 rounded-full" />
        
        <div className="space-y-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-white/10" />
                  <div className="h-3 w-16 bg-white/10 rounded-full" />
                </div>
                <div className="h-3 w-8 bg-white/10 rounded-full" />
              </div>
              <div className="h-3 w-full bg-white/5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
