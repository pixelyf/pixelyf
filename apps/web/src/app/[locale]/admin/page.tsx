'use client'

import { useState, useEffect } from 'react'
import {
  Users, MessageSquare, ShieldAlert, Globe, TrendingUp, Sparkles,
  UserPlus, Activity, Link2, Bell, ArrowUpRight, BarChart3, Zap
} from 'lucide-react'

interface Stats {
  users: { total: number; active: number; banned: number; shadowBanned: number; newToday: number }
  moments: { total: number; deleted: number; newToday: number }
  reports: { pending: number; approved: number; dismissed: number }
  social: { totalPings: number; totalBonds: number; totalSubscriptions: number }
  galaxies: { key: string; coordCount: number }[]
  recent: {
    users: { id: string; display_name: string; pixel_id: string; supernova_tier: string; created_at: string }[]
    moments: { id: string; content: string; category: string; is_deleted: boolean; created_at: string; user: { display_name: string; pixel_id: string } }[]
    reports: { id: string; reason: string; status: string; created_at: string; users_user_reports_reporter_idTousers: { display_name: string }; users_user_reports_reported_idTousers: { display_name: string } }[]
  }
}

const GALAXY_META: Record<string, { label: string; color: string; gradient: string }> = {
  PIXELYF_CORE: { label: '픽셀리프', color: '#A855F7', gradient: 'from-purple-500/20 to-purple-900/10' },
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      if (!data.error) {
        setStats(data)
        setLastRefresh(new Date())
      }
    } catch (err) {
      console.error('[Dashboard]', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 60000) // 1분 자동 갱신
    return () => clearInterval(interval)
  }, [])

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">통계 데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  const kpiCards = [
    {
      icon: Users,
      label: '총 사용자',
      value: stats.users.total,
      sub: `활성 ${formatNumber(stats.users.active)}`,
      accent: 'from-indigo-500 to-purple-500',
      iconBg: 'bg-indigo-500/10',
      iconColor: 'text-indigo-400',
      badge: stats.users.shadowBanned > 0 ? `${stats.users.shadowBanned} 밴` : null,
      badgeColor: 'bg-rose-500/10 text-rose-400',
    },
    {
      icon: UserPlus,
      label: '오늘 가입',
      value: stats.users.newToday,
      sub: '신규 가입 수',
      accent: 'from-emerald-500 to-teal-500',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      badge: null,
      badgeColor: '',
    },
    {
      icon: MessageSquare,
      label: '총 모먼트',
      value: stats.moments.total,
      sub: `오늘 +${stats.moments.newToday}`,
      accent: 'from-amber-500 to-orange-500',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      badge: stats.moments.deleted > 0 ? `${stats.moments.deleted} 삭제됨` : null,
      badgeColor: 'bg-slate-700 text-slate-400',
    },
    {
      icon: ShieldAlert,
      label: '대기 신고',
      value: stats.reports.pending,
      sub: `총 ${stats.reports.approved + stats.reports.dismissed} 처리됨`,
      accent: stats.reports.pending > 0 ? 'from-rose-500 to-pink-500' : 'from-slate-600 to-slate-700',
      iconBg: stats.reports.pending > 0 ? 'bg-rose-500/10' : 'bg-slate-800',
      iconColor: stats.reports.pending > 0 ? 'text-rose-400' : 'text-slate-500',
      badge: stats.reports.pending > 0 ? '처리 필요' : null,
      badgeColor: 'bg-rose-500/10 text-rose-400 animate-pulse',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            운영 대시보드
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            마지막 갱신: {lastRefresh.toLocaleTimeString()} · 1분마다 자동 갱신
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm text-slate-300 transition flex items-center gap-2"
        >
          <Activity className="w-4 h-4" /> 새로고침
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition group"
          >
            {/* Gradient accent line */}
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${card.accent}`} />
            
            <div className="flex items-start justify-between">
              <div className={`p-3 rounded-xl ${card.iconBg}`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              {card.badge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
                  {card.badge}
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-3xl font-bold text-white tracking-tight">
                {formatNumber(card.value)}
              </div>
              <div className="text-sm text-slate-400 mt-1">{card.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 은하별 통계 + 소셜 통계 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 은하별 분포 */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2 mb-5">
            <Globe className="w-5 h-5 text-cyan-400" /> 은하별 좌표 분포
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.galaxies.map((g) => {
              const meta = GALAXY_META[g.key] || { label: g.key, color: '#888', gradient: 'from-slate-500/20 to-slate-900/10' }
              const pct = stats.users.total > 0 ? ((g.coordCount / (stats.users.total * 3)) * 100).toFixed(1) : '0'
              return (
                <div key={g.key} className={`bg-gradient-to-br ${meta.gradient} border border-slate-800 rounded-xl p-5`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="text-sm font-semibold text-slate-200">{meta.label}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{g.key}</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{formatNumber(g.coordCount)}</div>
                  <div className="text-xs text-slate-500 mt-1">좌표 · 커버리지 {pct}%</div>
                  {/* Mini progress bar */}
                  <div className="mt-3 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 소셜 인터랙션 통계 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2 mb-5">
            <Zap className="w-5 h-5 text-amber-400" /> 소셜 인터랙션
          </h3>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pink-500/10"><Sparkles className="w-4 h-4 text-pink-400" /></div>
                <span className="text-sm text-slate-300">총 핑</span>
              </div>
              <span className="text-lg font-bold text-white">{formatNumber(stats.social.totalPings)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10"><Link2 className="w-4 h-4 text-indigo-400" /></div>
                <span className="text-sm text-slate-300">별자리 연결</span>
              </div>
              <span className="text-lg font-bold text-white">{formatNumber(stats.social.totalBonds)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10"><Bell className="w-4 h-4 text-amber-400" /></div>
                <span className="text-sm text-slate-300">생각 구독</span>
              </div>
              <span className="text-lg font-bold text-white">{formatNumber(stats.social.totalSubscriptions)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 최근 활동 피드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 최근 가입 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-emerald-400" /> 최근 가입
          </h3>
          <div className="space-y-3">
            {stats.recent.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                <div>
                  <div className="text-sm font-medium text-slate-200">{u.display_name}</div>
                  <div className="text-[10px] text-slate-500">@{u.pixel_id}</div>
                </div>
                <div className="text-right">
                  <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    u.supernova_tier === 'GOLD' ? 'bg-amber-500/10 text-amber-400' :
                    u.supernova_tier === 'SILVER' ? 'bg-slate-600/20 text-slate-300' :
                    u.supernova_tier === 'BRONZE' ? 'bg-orange-500/10 text-orange-400' :
                    'bg-slate-800 text-slate-500'
                  }`}>
                    {u.supernova_tier || 'STARTER'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{timeAgo(u.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 모먼트 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-amber-400" /> 최근 모먼트
          </h3>
          <div className="space-y-3">
            {stats.recent.moments.map((m) => (
              <div key={m.id} className={`p-3 bg-slate-950 rounded-xl border ${m.is_deleted ? 'border-rose-500/20' : 'border-slate-800/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-slate-400">{m.user?.display_name}</span>
                  <span className="text-[10px] text-slate-500">{timeAgo(m.created_at)}</span>
                </div>
                <p className={`text-xs leading-relaxed line-clamp-2 ${m.is_deleted ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                  {m.content}
                </p>
                {m.category && (
                  <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">
                    {m.category}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 최근 신고 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-rose-400" /> 최근 신고
          </h3>
          <div className="space-y-3">
            {stats.recent.reports.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-8">대기 중인 신고가 없습니다 ✓</div>
            ) : (
              stats.recent.reports.map((r) => (
                <div key={r.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      r.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400' :
                      r.status === 'APPROVED' ? 'bg-rose-500/10 text-rose-400' :
                      'bg-slate-800 text-slate-500'
                    }`}>
                      {r.status}
                    </span>
                    <span className="text-[10px] text-slate-500">{timeAgo(r.created_at)}</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1">
                    <span className="text-slate-500">사유:</span> {r.reason}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {r.users_user_reports_reporter_idTousers?.display_name} → {r.users_user_reports_reported_idTousers?.display_name}
                  </div>
                </div>
              ))
            )}
            <a
              href="/admin/reports"
              className="flex items-center justify-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition pt-2"
            >
              전체 보기 <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
