'use client'

import { Eye, Calendar, Clock } from 'lucide-react'
import { AnalyticsData } from './useAnalyticsData'
import DeltaIndicator from './DeltaIndicator'
import AnalyticsLineChart from './AnalyticsLineChart'

interface AnalyticsAudienceProps {
  data: AnalyticsData
}

// 국기 이모지 변환 (국가 코드 → 국기)
function countryToFlag(code: string): string {
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 0x1F1E6 - 65 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

export default function AnalyticsAudience({ data }: AnalyticsAudienceProps) {
  const todayVisits = data.visits?.today_visits ?? 0
  const yesterdayVisits = data.visits?.yesterday_visits ?? 0
  const totalVisits = data.visits?.total_visits ?? 0
  const chartData = data.dailyVisits ?? []
  const countries = data.visitorsByCountry ?? []
  const recentVisitors = data.recentVisitors ?? []

  return (
    <div className="space-y-6">
      {/* Hero 카드 3개 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Eye className="w-3.5 h-3.5 text-white/50" />
            <span className="text-[10px] text-white/50">기간 내</span>
          </div>
          <div className="text-xl font-black text-white">{totalVisits.toLocaleString()}</div>
          <DeltaIndicator current={totalVisits} previous={data.previousPeriod?.visits ?? null} />
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-white/50" />
            <span className="text-[10px] text-white/50">오늘</span>
          </div>
          <div className="text-xl font-black text-white">{todayVisits.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-white/50" />
            <span className="text-[10px] text-white/50">어제</span>
          </div>
          <div className="text-xl font-black text-white">{yesterdayVisits.toLocaleString()}</div>
        </div>
      </div>

      {/* 방문자 추이 라인차트 */}
      {chartData.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-white/50 mb-3">일별 방문자</div>
          <AnalyticsLineChart data={chartData} height={180} />
        </div>
      )}

      {/* 국가별 방문자 분포 */}
      {countries.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-white/50 mb-4">국가별 방문자 (TOP 10)</div>
          <div className="space-y-3">
            {countries.slice(0, 10).map(c => (
              <div key={c.country}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{countryToFlag(c.country)}</span>
                    <span className="text-white/70">{c.country}</span>
                  </div>
                  <span className="text-white/50">{c.count} ({c.percentage}%)</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${c.percentage}%`,
                      backgroundColor: 'rgba(255,255,255,0.50)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 방문자 */}
      {recentVisitors.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-white/50 mb-4">최근 방문자</div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {recentVisitors.map(v => (
              <div key={v.id} className="flex flex-col items-center gap-1.5 min-w-[56px]">
                <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                  {v.avatarUrl ? (
                    <img
                      src={v.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white/30 text-xs">
                      {(v.displayName || '?').charAt(0)}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-white/50 truncate max-w-[56px]">
                  {v.displayName || '익명'}
                </span>
                <span className="text-[9px] text-white/30">
                  {formatTimeAgo(v.visitedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return '방금'
    if (hours < 24) return `${hours}시간`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일`
    return `${Math.floor(days / 7)}주`
  } catch {
    return ''
  }
}
