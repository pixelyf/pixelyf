'use client'

import { useState } from 'react'
import { Hand, Heart, Sparkles, MessageCircle, Link, Compass, User, RefreshCw } from 'lucide-react'
import { AnalyticsData } from './useAnalyticsData'
import DeltaIndicator from './DeltaIndicator'
import Sparkline from './Sparkline'
import AnalyticsLineChart from './AnalyticsLineChart'

type MetricKey = 'touches' | 'pings' | 'supernovas' | 'comments'
type ActivityFilter = 'all' | 'ping' | 'touch' | 'bond'

interface EngagementCard {
  key: MetricKey
  label: string
  subLabel?: (d: AnalyticsData) => string
  icon: typeof Hand
  getValue: (d: AnalyticsData) => number
  getPrevious: (d: AnalyticsData) => number | null
  getDailyData: (d: AnalyticsData) => { date: string; count: number }[]
}

const CARDS: EngagementCard[] = [
  {
    key: 'touches',
    label: '받은 터치',
    subLabel: d => `보낸 ${d.sentTouches ?? 0}`,
    icon: Hand,
    getValue: d => d.touches ?? 0,
    getPrevious: d => d.previousPeriod?.touches ?? null,
    getDailyData: d => d.dailyTouches ?? [],
  },
  {
    key: 'pings',
    label: '받은 핑',
    subLabel: d => `보낸 ${d.sentPings ?? 0}`,
    icon: Heart,
    getValue: d => Math.max(0, (d.totalPings ?? 0) - (d.supernovas ?? 0)),
    getPrevious: d => d.previousPeriod?.pings ?? null,
    getDailyData: d => d.dailyPings ?? [],
  },
  {
    key: 'supernovas',
    label: '초신성',
    icon: Sparkles,
    getValue: d => d.supernovas ?? 0,
    getPrevious: () => null,
    getDailyData: () => [],
  },
  {
    key: 'comments',
    label: '댓글',
    icon: MessageCircle,
    getValue: d => d.comments ?? 0,
    getPrevious: () => null,
    getDailyData: () => [],
  },
]

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 1) return '방금 전'
  if (diffMins < 60) return `${diffMins}분 전`
  
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}시간 전`
  
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return '어제'
  if (diffDays < 7) return `${diffDays}일 전`
  
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

interface AnalyticsEngagementProps {
  data: AnalyticsData
}

export default function AnalyticsEngagement({ data }: AnalyticsEngagementProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('touches')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')

  const selectedCard = CARDS.find(c => c.key === selectedMetric) ?? CARDS[0]
  const chartData = selectedCard.getDailyData(data)

  // 핑 타입별 분포
  const pingTypes = data.pings ?? []
  const totalPingCount = pingTypes.reduce((sum, p) => sum + p.count, 0) || 1

  // 액티비티 피드 수급
  const recentPings = data.recentPings ?? []
  const recentTouches = data.recentTouches ?? []
  const recentBonds = data.recentBonds ?? []

  // 모든 액티비티 정밀 결합 및 정렬
  const allActivities = [
    ...recentPings.map(p => ({
      id: p.id,
      type: 'ping' as const,
      user: p.sender,
      createdAt: p.createdAt,
      details: {
        pingType: p.pingType,
        isCrystal: p.isCrystal,
        moment: p.moment,
      }
    })),
    ...recentTouches.map(t => ({
      id: t.id,
      type: 'touch' as const,
      user: t.toucher,
      createdAt: t.createdAt,
      details: {}
    })),
    ...recentBonds.map(b => ({
      id: b.id,
      type: 'bond' as const,
      user: b.partner,
      createdAt: b.createdAt,
      details: {}
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 필터에 따른 목록 분기
  const filteredActivities = allActivities.filter(act => {
    if (activityFilter === 'all') return true
    return act.type === activityFilter
  })

  return (
    <div className="space-y-6">
      {/* Hero 카드 */}
      <div className="grid grid-cols-2 gap-3">
        {CARDS.map(card => {
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
                text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none
                ${isSelected
                  ? 'bg-white/10 border-white/15 shadow-lg shadow-black/20'
                  : 'bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/12'
                }
              `}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[10px] text-white/50 uppercase tracking-wider font-bold">{card.label}</span>
              </div>
              <div className="text-2xl font-black text-white mb-1">
                {value.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <DeltaIndicator current={value} previous={previous} />
                  {card.subLabel && (
                    <div className="text-[10px] text-white/30 mt-0.5">{card.subLabel(data)}</div>
                  )}
                </div>
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
        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 shadow-2xl">
          <div className="text-xs font-bold text-white/50 mb-3">
            {selectedCard.label} 추이
          </div>
          <AnalyticsLineChart data={chartData} height={180} />
        </div>
      )}

      {/* 핑 타입 분포 & 연결 (2열 레이아웃) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 핑 타입별 분포 */}
        {pingTypes.length > 0 && (
          <div className="bg-black/30 border border-white/5 rounded-2xl p-4 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-white/50 mb-4">핑 타입별 분포</div>
              <div className="space-y-3">
                {pingTypes.map(p => {
                  const pct = Math.round((p.count / totalPingCount) * 100)
                  return (
                    <div key={p.ping_type}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/70 font-semibold">{p.ping_type}</span>
                        <span className="text-white/40">{p.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 연결 통계 카드 */}
        <div className="bg-black/30 border border-white/5 rounded-2xl p-5 shadow-2xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-sky-500/10 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-white/50">별자리 연결 (Bonds)</span>
            <Compass className="w-5 h-5 text-sky-400 animate-slow-rotate" />
          </div>
          <div>
            <div className="text-3xl font-black text-white tracking-tight">
              {(data.bonds ?? 0).toLocaleString()}
            </div>
            <p className="text-[10px] text-white/30 mt-2 leading-relaxed">
              서로 수락된 별자리 연결입니다. 더 매끄럽고 깊은 연결을 통해 나만의 캔버스를 확장해 보세요.
            </p>
          </div>
        </div>
      </div>

      {/* 🔴 [업계 표준] 최근 상세 액티비티 피드 타임라인 */}
      <div className="bg-black/30 border border-white/5 rounded-2xl p-4 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-white/40" />
            <h3 className="text-sm font-bold text-white/90">실시간 활동 상세 피드</h3>
          </div>
          {/* 필터 칩 */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {(['all', 'ping', 'touch', 'bond'] as const).map(f => {
              const label = f === 'all' ? '전체' : f === 'ping' ? '핑' : f === 'touch' ? '터치' : '연결'
              return (
                <button
                  key={f}
                  onClick={() => setActivityFilter(f)}
                  className={`
                    px-2.5 py-1 rounded-full text-[10px] font-bold tracking-tight whitespace-nowrap transition-all border
                    ${activityFilter === f
                      ? 'bg-white text-black border-white'
                      : 'text-white/40 border-white/5 bg-white/3 hover:bg-white/5 hover:text-white/60'
                    }
                  `}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 액티비티 피드 목록 */}
        {filteredActivities.length > 0 ? (
          <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar pr-1 space-y-3.5 pt-2">
            {filteredActivities.map(act => {
              const u = act.user
              const ago = formatTimeAgo(act.createdAt)

              return (
                <div key={act.id} className="flex gap-3.5 pt-3.5 first:pt-0 group select-none">
                  {/* 아바타 */}
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 shrink-0 relative bg-black/30 flex items-center justify-center">
                    {u?.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-white/30" />
                    )}
                  </div>

                  {/* 세부 본문 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-white hover:text-sky-300 transition-colors cursor-pointer">
                        {u?.displayName || '익명의 사용자'}
                      </span>
                      {u?.country && (
                        <span className="text-[8px] font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 uppercase">
                          {u.country}
                        </span>
                      )}
                      <span className="text-[10px] text-white/30 ml-auto shrink-0">{ago}</span>
                    </div>

                    <div className="text-xs text-white/70 mt-1 leading-relaxed">
                      {act.type === 'ping' && (
                        <span>
                          {act.details.isCrystal ? (
                            <span className="text-purple-400 font-semibold flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 inline animate-pulse" />
                              내 픽셀에 초신성 슈퍼 핑을 보냈습니다!
                            </span>
                          ) : (
                            <span>
                              내 픽셀에{' '}
                              <span className="text-sky-400 font-bold border-b border-sky-400/20">
                                '{act.details.pingType}'
                              </span>{' '}
                              핑을 전송했습니다.
                            </span>
                          )}
                        </span>
                      )}
                      {act.type === 'touch' && (
                        <span>
                          내 픽셀을 <span className="text-emerald-400 font-bold">터치</span>하여 흔적을 남겼습니다.
                        </span>
                      )}
                      {act.type === 'bond' && (
                        <span className="text-sky-300 font-semibold flex items-center gap-1">
                          <Link className="w-3 h-3 inline" />
                          새로운 별자리 연결이 완성되었습니다.
                        </span>
                      )}
                    </div>

                    {/* 핑의 경우 연계된 모먼트가 있으면 말풍선 렌더링 */}
                    {act.type === 'ping' && act.details.moment?.content && (
                      <div className="mt-2 bg-white/5 hover:bg-white/8 transition-colors p-2.5 rounded-xl border border-white/5 text-[11px] text-white/60 italic leading-normal max-w-lg cursor-pointer">
                        "{act.details.moment.content.slice(0, 150)}"
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* 빈 상태 (Empty State) */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/5 mb-3 shadow-inner">
              <Compass className="w-5 h-5 text-white/30" />
            </div>
            <p className="text-xs font-bold text-white/50">표시할 최근 활동이 없습니다</p>
            <p className="text-[10px] text-white/30 max-w-[260px] mt-1.5 leading-normal">
              은하 지도에서 주위 별들에게 핑을 보내고 연결을 맺어 액티비티를 활성화해보세요.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
