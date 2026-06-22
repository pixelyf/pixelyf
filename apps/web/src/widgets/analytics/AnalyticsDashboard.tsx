'use client'

import { useState } from 'react'
import { BarChart2, ArrowLeft, Loader2, Menu, X, LayoutDashboard, Zap, Users, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { useAnalyticsData } from './useAnalyticsData'
import AnalyticsTabs, { AnalyticsTabId } from './AnalyticsTabs'
import AnalyticsOverview from './AnalyticsOverview'
import AnalyticsEngagement from './AnalyticsEngagement'
import AnalyticsAudience from './AnalyticsAudience'
import AnalyticsContent from './AnalyticsContent'

const PERIODS = [
  { value: 1, label: '오늘' },
  { value: 7, label: '7일' },
  { value: 28, label: '28일' },
  { value: 90, label: '90일' },
  { value: 0, label: '전체' },
] as const

interface AnalyticsDashboardProps {
  userId: string
  moodId?: string | null
}

const TABS_CONFIG = [
  { id: 'overview', label: '개요', icon: LayoutDashboard },
  { id: 'engagement', label: '인터랙션', icon: Zap },
  { id: 'audience', label: '방문자', icon: Users },
  { id: 'content', label: '콘텐츠', icon: FileText },
] as const

export default function AnalyticsDashboard({ userId, moodId }: AnalyticsDashboardProps) {
  const router = useRouter()
  const [period, setPeriod] = useState(28)
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>('overview')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const { themeStyle } = useMoodColor(moodId)
  const { data, isLoading, error } = useAnalyticsData(userId, period)
  
  const user = data?.user

  // Aura 스타일에 맞는 컬러 배지 반환
  const renderAuraBadge = (aura?: string) => {
    if (!aura) return null
    let classes = 'bg-white/5 text-white/70 border border-white/10'
    if (aura === 'GLOW') {
      classes = 'bg-sky-500/10 text-sky-400 border border-sky-500/30 shadow-[0_0_10px_rgba(56,189,248,0.15)] text-glow-blue'
    } else if (aura === 'MYSTIC') {
      classes = 'bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.15)]'
    } else if (aura === 'VIBRANT') {
      classes = 'bg-pink-500/10 text-pink-400 border border-pink-500/30 shadow-[0_0_10px_rgba(244,114,182,0.15)]'
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase inline-block ${classes}`}>
        {aura}
      </span>
    )
  }

  // 사이드바 내부 구성요소 공통 렌더러
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between select-none">
      <div className="space-y-6">
        {/* 상단: 헤더 로고 & 닫기 버튼(모바일용) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-white/80" />
            <h1 className="text-sm font-bold tracking-tight text-white/90">Analytics Studio</h1>
          </div>
          {isMobileSidebarOpen && (
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10"
            >
              <X className="w-4 h-4 text-white/80" />
            </button>
          )}
        </div>

        {/* 미니 프로필 카드 */}
        {user ? (
          <div className="bg-black/35 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/3 rounded-full blur-2xl group-hover:bg-white/5 transition-all duration-300 pointer-events-none" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 relative bg-black/20 shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/60 font-bold text-lg">
                    {user.displayName.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-white truncate">{user.displayName}</div>
                <div className="text-[10px] text-white/40 truncate">@{user.pixelId || user.id.slice(0, 8)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
              {renderAuraBadge(user.currentAura)}
              {user.country && (
                <span className="text-[10px] text-white/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 font-medium">
                  {user.country}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-black/20 border border-white/5 rounded-2xl p-4 animate-pulse flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/10 rounded w-2/3" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          </div>
        )}

        {/* 메뉴 리스트 (유튜브 스튜디오 및 인스타 스타일) */}
        <nav className="space-y-1 pt-4">
          {TABS_CONFIG.map(tab => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setIsMobileSidebarOpen(false)
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide
                  transition-all duration-200 text-left border
                  ${isActive
                    ? 'bg-white/10 text-white border-white/10 font-bold'
                    : 'text-white/50 border-transparent hover:bg-white/5 hover:text-white/80 hover:border-white/5'
                  }
                `}
              >
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-white' : 'text-white/40'}`} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* 하단: 뒤로가기 */}
      <div className="pt-6 border-t border-white/5">
        <button
          onClick={() => router.back()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/5 
                     hover:bg-white/10 transition-colors text-xs font-bold text-white/70 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>픽셀 공간으로 가기</span>
        </button>
      </div>
    </div>
  )

  return (
    <div
      className="flex h-screen w-screen overflow-hidden text-white select-none"
      style={{
        ...themeStyle,
        backgroundColor: 'rgb(var(--theme-rgb-deep, 2, 6, 23))',
      }}
    >
      {/* 1. 데스크톱 좌측 고정 사이드바 */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 border-r border-white/5 bg-black/35 backdrop-blur-xl p-6 h-full">
        {renderSidebarContent()}
      </aside>

      {/* 2. 모바일/태블릿 사이드바 Drawer 오버레이 */}
      {isMobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* 백드롭 */}
          <div 
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          />
          {/* Drawer 바디 */}
          <aside className="relative flex flex-col w-64 bg-black/85 backdrop-blur-2xl p-6 h-full border-r border-white/10 animate-in slide-in-from-left duration-300">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* 3. 우측 메인 영역 */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* 헤더 */}
        <header className="flex items-center justify-between border-b border-white/5 bg-black/15 px-6 py-4 flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Menu className="w-4 h-4 text-white/80" />
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight lg:block hidden">
                {TABS_CONFIG.find(t => t.id === activeTab)?.label} 대시보드
              </h2>
              <h2 className="text-base font-bold text-white tracking-tight lg:hidden block">내 픽셀 통계</h2>
            </div>
          </div>

          {/* 기간 필터 */}
          <div className="flex gap-1 bg-black/30 p-1 rounded-full border border-white/5 shrink-0">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`
                  px-3 py-1 rounded-full text-[10px] font-bold tracking-tight transition-all duration-200
                  ${period === p.value
                    ? 'bg-white text-black shadow-md'
                    : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                  }
                `}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        {/* 모바일 하위 호환형 가로 탭 바 (사이드바가 안 보이는 lg미만 화면에서만 렌더링) */}
        <div className="lg:hidden block px-6 pt-3 bg-black/10 border-b border-white/5 flex-shrink-0">
          <AnalyticsTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* 탭 콘텐츠 영역 (상하 스크롤 가능) */}
        <div className="flex-1 overflow-y-auto px-6 py-6 pb-24 custom-scrollbar bg-transparent">
          {/* 로딩 */}
          {isLoading && (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-7 h-7 text-white/20 animate-spin" />
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="text-center py-32 bg-black/20 border border-white/5 rounded-2xl p-6 max-w-md mx-auto mt-10">
              <p className="text-white/40 text-sm font-semibold">데이터를 불러올 수 없습니다</p>
              <p className="text-white/20 text-xs mt-2">{error.message}</p>
            </div>
          )}

          {/* 대시보드 콘텐츠 */}
          {data && !isLoading && (
            <div className="max-w-5xl mx-auto space-y-6">
              {activeTab === 'overview' && <AnalyticsOverview data={data} />}
              {activeTab === 'engagement' && <AnalyticsEngagement data={data} />}
              {activeTab === 'audience' && <AnalyticsAudience data={data} />}
              {activeTab === 'content' && <AnalyticsContent data={data} />}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
