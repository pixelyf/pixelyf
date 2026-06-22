'use client'

import { FileText, Heart, MessageCircle } from 'lucide-react'
import { AnalyticsData } from './useAnalyticsData'
import DeltaIndicator from './DeltaIndicator'
import AnalyticsLineChart from './AnalyticsLineChart'

interface AnalyticsContentProps {
  data: AnalyticsData
}

export default function AnalyticsContent({ data }: AnalyticsContentProps) {
  const momentsCount = data.momentsCount ?? 0
  const totalPings = data.totalPings ?? 0
  const comments = data.comments ?? 0
  const avgPings = momentsCount > 0 ? Math.round((totalPings / momentsCount) * 10) / 10 : 0
  const avgComments = momentsCount > 0 ? Math.round((comments / momentsCount) * 10) / 10 : 0
  const chartData = data.dailyMoments ?? []
  const topMoments = data.topMoments ?? []
  const moodDist = data.moodDistribution ?? []
  const totalMoodCount = moodDist.reduce((sum, m) => sum + m.count, 0) || 1

  return (
    <div className="space-y-6">
      {/* Hero 카드 3개 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="w-3.5 h-3.5 text-white/50" />
            <span className="text-[10px] text-white/50">모먼트</span>
          </div>
          <div className="text-xl font-black text-white">{momentsCount.toLocaleString()}</div>
          <DeltaIndicator current={momentsCount} previous={data.previousPeriod?.moments ?? null} />
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Heart className="w-3.5 h-3.5 text-white/50" />
            <span className="text-[10px] text-white/50">평균 핑</span>
          </div>
          <div className="text-xl font-black text-white">{avgPings}</div>
          <div className="text-[10px] text-white/30 mt-0.5">모먼트당</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <MessageCircle className="w-3.5 h-3.5 text-white/50" />
            <span className="text-[10px] text-white/50">평균 댓글</span>
          </div>
          <div className="text-xl font-black text-white">{avgComments}</div>
          <div className="text-[10px] text-white/30 mt-0.5">모먼트당</div>
        </div>
      </div>

      {/* 모먼트 작성 라인차트 */}
      {chartData.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-white/50 mb-3">일별 모먼트 작성</div>
          <AnalyticsLineChart data={chartData} height={180} />
        </div>
      )}

      {/* TOP 5 인기 모먼트 */}
      {topMoments.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-white/50 mb-4">인기 모먼트 TOP {Math.min(5, topMoments.length)}</div>
          <div className="space-y-3">
            {topMoments.slice(0, 5).map((m, i) => (
              <div key={m.id} className="flex gap-3">
                <div className="text-xs text-white/30 w-4 pt-0.5">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 truncate">{m.content || '(내용 없음)'}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] text-white/40 flex items-center gap-1">
                      <Heart className="w-3 h-3" /> {m.pingCount}
                    </span>
                    <span className="text-[10px] text-white/40 flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" /> {m.commentCount}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 무드 분포 */}
      {moodDist.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-white/50 mb-4">무드 분포</div>
          <div className="space-y-3">
            {moodDist.map(m => {
              const pct = Math.round((m.count / totalMoodCount) * 100)
              return (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/70">{m.label || '미지정'}</span>
                    <span className="text-white/50">{m.count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: 'rgba(255,255,255,0.50)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
