'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, BarChart2, Eye, Calendar, TrendingUp, Hand, Link2, BellRing,
  MessageSquare, Sparkles, Heart, Activity, Users, ChevronRight, Globe, Star
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { CAMERA_ZOOM } from '@/shared/constants/camera'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { PING_TYPES } from '@/shared/constants/pings'
import { requestHideTabBar, requestShowTabBar, syncNativeTab } from '@/shared/lib/bridge'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { createClient } from '@/shared/lib/supabase/browser'

type AnalyticsTab = 'dashboard' | 'visits' | 'pings' | 'touches' | 'comments'

interface PixelAnalyticsPanelProps {
  isOpen: boolean
  onClose?: () => void
  userId: string
  pixelName?: string
  moodId?: string | null
  isStandalone?: boolean
}

export function PixelAnalyticsPanel({
  isOpen,
  onClose,
  userId,
  pixelName: propPixelName,
  moodId: propMoodId,
  isStandalone = false
}: PixelAnalyticsPanelProps) {
  const router = useRouter()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const loginUser = useUserStore(s => s.user)
  
  // ── 전역 캔버스 포커싱 액션 ──
  const selectPixel = useGalaxyStore(s => s.selectPixel)
  const focusOnPosition = useGalaxyStore(s => s.focusOnPosition)

  // ── 상태 관리 ──
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('dashboard')
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pixelInfo, setPixelInfo] = useState<{ displayName: string; moodId: string | null }>({
    displayName: propPixelName || '',
    moodId: propMoodId || null
  })

  const { themeStyle, primaryHex, secondaryHex } = useMoodColor(pixelInfo.moodId)
  const t = useTranslations('Pixel')

  // ── 데이터 GET 호출 ──
  const fetchStats = useCallback(async (isSilent = false) => {
    if (!userId) return
    if (!isSilent) setLoading(true)
    try {
      // 1. 통계 데이터 GET 호출 (방문 적재 POST는 호출하지 않음)
      const res = await fetch(`/api/users/${userId}/statistics?galaxy=${galaxyKey}`)
      const data = await res.json()
      if (data && data.success) {
        setStats(data.data)
      }

      // 2. 만약 프로필 이름이나 무드가 없다면 캔버스 SpatialGrid에서 보완
      if (!pixelInfo.displayName) {
        const grid = useGalaxyStore.getState().spatialGrid
        const preloaded = useGalaxyStore.getState().preloadedPixelData
        if (preloaded && preloaded.pixelId === userId) {
          setPixelInfo({
            displayName: preloaded.displayName || '',
            moodId: preloaded.moodId || null
          })
        } else if (grid) {
          const p = grid.getPixel(userId)
          if (p) {
            setPixelInfo({
              displayName: p.displayName || '',
              moodId: p.moodId || null
            })
          }
        }
      }
    } catch (e) {
      console.error('Fetch analytics statistics error', e)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [userId, galaxyKey, pixelInfo.displayName])

  useEffect(() => {
    if (isOpen) {
      fetchStats()
    }
  }, [isOpen, fetchStats])

  // ── 실시간 데이터 갱신을 위한 Supabase Realtime Broadcast 바인딩 ──
  useEffect(() => {
    if (!isOpen || !userId || !loginUser) return

    // 분석 대상이 로그인한 나 자신인 경우에만 실시간 채널 구독
    const isMe = userId === loginUser.id
    if (!isMe) return

    const supabase = createClient()
    const channel = supabase.channel(`user-notifications-${userId}`)

    channel
      .on('broadcast', { event: 'notification-count-update' }, () => {
        // 로딩 스피너 노출 없이 백그라운드에서 조용히 리패치 및 통계 스왑
        fetchStats(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOpen, userId, loginUser, fetchStats])

  // 배경 스크롤 잠금 (모달 모드 전용)
  useEffect(() => {
    if (isOpen && !isStandalone) {
      document.body.style.overflow = 'hidden'
      if (isMobile) {
        requestHideTabBar()
        return () => {
          requestShowTabBar()
          syncNativeTab('restore')
        }
      }
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, isMobile, isStandalone])

  // 유저 프로필 카드 클릭 시 캔버스 카메라 포커스 이동 헬퍼
  const handleUserClick = useCallback((targetUserId: string) => {
    // 1. 모달 닫기 애니메이션 완료 대기
    if (onClose) onClose()
    else if (isStandalone) router.push('/')

    // 2. 150ms 프레임 지연 후 캔버스 이동 실행 (화면 튐 방지)
    setTimeout(() => {
      const grid = useGalaxyStore.getState().spatialGrid
      if (grid) {
        const targetPixel = grid.getPixel(targetUserId)
        if (targetPixel && targetPixel.coordX !== undefined && targetPixel.coordY !== undefined) {
          selectPixel(targetUserId)
          focusOnPosition(targetPixel.coordX, targetPixel.coordY, CAMERA_ZOOM.PIXEL_FOCUS, true)
        }
      }
    }, 150)
  }, [onClose, isStandalone, router, selectPixel, focusOnPosition])

  const handleClose = useCallback(() => {
    if (onClose) onClose()
    else router.push('/')
  }, [onClose, router])

  if (!isOpen) return null

  // ── 번역 헬퍼 ──
  const getLabel = (key: string, fallback: string, values?: any) => {
    return t.has(key as any) ? t(key as any, values) : fallback
  }

  // ── 탭 리스트 정의 ──
  const tabsDef = [
    { id: 'dashboard', label: getLabel('insightTitleTab', '종합 분석'), icon: BarChart2 },
    { id: 'visits', label: getLabel('insightVisitorTraffic', '오늘 방문자'), icon: Eye },
    { id: 'pings', label: getLabel('insightReceivedPing', '받은 핑 로그'), icon: Activity },
    { id: 'touches', label: getLabel('insightTouchLabel', '터치 로그'), icon: Hand },
    { id: 'comments', label: getLabel('insightCommentLabel', '최근 댓글'), icon: MessageSquare }
  ] as const

  // ── 1. 종합 분석 대시보드 뷰 ──
  const totalInteractions = stats ? (
    (stats.touches || 0) +
    (stats.bonds || 0) +
    (stats.subscriptions || 0) +
    (stats.comments || 0) +
    (stats.supernovas || 0) +
    (stats.totalPings || 0)
  ) : 0

  const DashboardView = () => {
    if (!stats) return null
    return (
      <div className="space-y-6 animate-in fade-in-50 duration-200">
        {/* 상단 통계 써머리 바 */}
        <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255,255,255,0.08)' }} className="p-5 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-xs text-white/40 mb-1">{getLabel('insightTarget', '분석 대상')}</p>
            <h3 className="text-lg font-black text-white">{getLabel('insightEcosystem', `@${pixelInfo.displayName}님의 픽셀 생태계`, { name: pixelInfo.displayName || '픽셀리어' })}</h3>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs text-white/40 mb-1">{getLabel('insightTotalIndex', '종합 상호작용 지수')}</p>
            <p className="text-2xl font-black text-white">{totalInteractions.toLocaleString()} <span className="text-xs text-white/30 font-medium">{getLabel('insightUnit', '점')}</span></p>
          </div>
        </div>

        {/* 방문자 수치 요약 */}
        <div className="grid grid-cols-3 gap-3">
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255,255,255,0.05)' }} className="p-4 rounded-xl border text-center">
            <p className="text-[10px] text-white/40 font-bold mb-1">{getLabel('insightToday', '오늘 방문')}</p>
            <p className="text-xl font-black text-white">{(stats.visits?.today_visits || 0).toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255,255,255,0.05)' }} className="p-4 rounded-xl border text-center">
            <p className="text-[10px] text-white/40 font-bold mb-1">{getLabel('insightYesterday', '어제 방문')}</p>
            <p className="text-xl font-black text-white/50">{(stats.visits?.yesterday_visits || 0).toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255,255,255,0.05)' }} className="p-4 rounded-xl border text-center">
            <p className="text-[10px] text-white/40 font-bold mb-1">{getLabel('insightTotalVisitors', '누적 방문')}</p>
            <p className="text-xl font-black text-white">{(stats.visits?.total_visits || 0).toLocaleString()}</p>
          </div>
        </div>

        {/* 상호작용 지표 그리드 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: getLabel('insightTouchLabel', '터치'), value: stats.touches, icon: Hand },
            { label: getLabel('insightBondLabel', '연결된 별자리'), value: stats.bonds, icon: Link2 },
            { label: getLabel('insightSubLabel', '생각 구독'), value: stats.subscriptions, icon: BellRing },
            { label: getLabel('insightSupernovaLabel', '초신성 후원'), value: stats.supernovas, icon: Sparkles },
            { label: getLabel('insightCommentLabel', '피드 댓글'), value: stats.comments, icon: MessageSquare }
          ].map((item, idx) => (
            <div key={idx} style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255,255,255,0.05)' }} className="p-4 rounded-xl border flex flex-col items-center justify-center text-center">
              <div className="p-2 rounded-lg bg-white/5 text-white/70 mb-2">
                <item.icon className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-bold text-white/40 mb-1">{item.label}</p>
              <p className="text-base font-black text-white">{(item.value || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* 핑 수신 유형 분포 */}
        <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255,255,255,0.05)' }} className="p-5 rounded-2xl border">
          <h4 className="text-xs font-bold text-white/60 mb-4 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            {getLabel('insightReceivedPing', '받은 핑 분포')} ({stats.totalPings || 0})
          </h4>
          {(!stats.pings || stats.pings.length === 0) ? (
            <div className="text-center py-8">
              <Heart className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs font-bold text-white/30">{getLabel('insightNoPing', '수신된 감정 신호가 없습니다')}</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {stats.pings.map((p: any) => {
                const pingInfo = PING_TYPES.find(pt => pt.id === p.ping_type)
                const maxCount = stats.pings[0]?.count || 1
                const percentage = Math.round((p.count / maxCount) * 100)
                const IconComp = (LucideIcons as any)[pingInfo?.icon || 'Heart'] || Heart

                return (
                  <div key={p.ping_type} className="flex items-center gap-3">
                    <div className="w-8 h-8 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <IconComp className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold text-white/80">{pingInfo?.label || p.ping_type}</span>
                        <span className="font-bold text-white/50">{p.count}회</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: primaryHex || '#6366F1'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 공용 유저 목록 컨테이너 ──
  const UserTimelineList = ({
    items,
    emptyMessage,
    renderAction
  }: {
    items: any[] | null
    emptyMessage: string
    renderAction?: (item: any) => React.ReactNode
  }) => {
    if (!items || items.length === 0) {
      return (
        <div className="text-center py-16 flex flex-col items-center justify-center animate-in fade-in-30">
          <Users className="w-12 h-12 text-white/10 mb-3" />
          <p className="text-sm font-bold text-white/30">{emptyMessage}</p>
        </div>
      )
    }

    return (
      <div className="space-y-2.5 animate-in fade-in-50 duration-200">
        {items.map((item, idx) => {
          const dateStr = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          return (
            <div
              key={item.commentId || `${item.id}-${idx}`}
              onClick={() => handleUserClick(item.id)}
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255,255,255,0.05)' }}
              className="p-3.5 rounded-xl border flex items-center justify-between gap-3 hover:bg-white/5 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* 아바타 썸네일 */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 overflow-hidden"
                  style={{
                    background: item.avatarUrl
                      ? 'transparent'
                      : `linear-gradient(135deg, ${primaryHex || '#6366F1'}, ${secondaryHex || '#A855F7'})`,
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (item.displayName || '?')[0]
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                      {item.displayName || '픽셀리어'}
                    </span>
                    <span className="text-[10px] text-white/30 font-bold shrink-0">{dateStr}</span>
                  </div>
                  {item.content && (
                    <p className="text-xs text-white/60 mt-1 line-clamp-1 break-all">
                      "{item.content}"
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {renderAction && renderAction(item)}
                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── 사이드바 메뉴 렌더러 ──
  const SidebarMenu = () => (
    <div className="flex flex-col h-full bg-black/10">
      <div className="p-5 border-b border-white/5 shrink-0">
        <h2 className="text-[16px] font-black text-white flex items-center gap-2">
          <Activity className="w-4.5 h-4.5 text-indigo-400" />
          {getLabel('insightTitle', '인사이트 분석', { name: pixelInfo.displayName || '픽셀리어' })}
        </h2>
        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Analytics Dashboard</p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
        {tabsDef.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group relative ${
                isActive
                  ? 'bg-white text-black font-black shadow-[0_4px_20px_rgba(255,255,255,0.15)]'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ backgroundColor: primaryHex || '#6366F1' }} />
              )}
              <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
              <div className="text-sm font-bold truncate">{tab.label}</div>
            </button>
          )
        })}
      </nav>
    </div>
  )

  // ── 메인 콘텐츠 브릿지 ──
  const renderContent = () => {
    if (loading) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center py-16">
          <LogoSpinner size={28} />
          <p className="text-xs text-white/40 font-bold mt-3">{getLabel('loadingAnalytics', '통계 정보를 분석하는 중...')}</p>
        </div>
      )
    }

    if (!stats) return null

    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />
      case 'visits':
        return (
          <UserTimelineList
            items={stats.recentVisitsList}
            emptyMessage={getLabel('insightNoVisitor', '오늘 아직 방문자가 없습니다')}
          />
        )
      case 'pings':
        return (
          <UserTimelineList
            items={stats.recentPingsList}
            emptyMessage={getLabel('insightNoPingLog', '받은 감정 핑 내역이 없습니다')}
            renderAction={(item) => {
              const pingInfo = PING_TYPES.find(p => p.id === item.pingType)
              const IconComp = (LucideIcons as any)[pingInfo?.icon || 'Heart'] || Heart
              return (
                <span className="flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/70">
                  <IconComp className="w-3 h-3 text-indigo-400" />
                  {pingInfo?.label || item.pingType}
                </span>
              )
            }}
          />
        )
      case 'touches':
        return (
          <UserTimelineList
            items={stats.recentTouchesList}
            emptyMessage={getLabel('insightNoTouchLog', '받은 터치 교류 내역이 없습니다')}
            renderAction={() => (
              <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                <Hand className="w-3 h-3" />
                TOUCHED
              </span>
            )}
          />
        )
      case 'comments':
        return (
          <UserTimelineList
            items={stats.recentCommentsList}
            emptyMessage={getLabel('insightNoCommentLog', '최근 달린 댓글 내역이 없습니다')}
            renderAction={(item) => (
              <span className="text-[10px] text-white/30 truncate max-w-[80px] font-bold">
                피드: {item.momentContent || '내용 없음'}
              </span>
            )}
          />
        )
      default:
        return null
    }
  }

  // ── 데스크탑: 우측 슬라이드 패널 연출 ──
  if (!isMobile) {
    const currentTab = tabsDef.find(t => t.id === activeTab)
    const HeaderIcon = currentTab?.icon

    return (
      <div style={themeStyle} className="contents">
        <AnimatePresence>
          {isOpen && (
            <>
              {/* 오버레이 — 설정모달과 동일하게 클릭으로 닫히지 않고 이벤트 완전 차단 */}
              <motion.div
                key="analytics-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[95] pointer-events-auto"
                onPointerMove={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
              />

              {/* 슬라이드인 패널 — 설정모달과 1:1 매칭 스타일 */}
              <motion.div
                key="analytics-panel"
                initial={{ x: '100%', opacity: 1 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 1 }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="fixed top-0 right-0 bottom-0 z-[100] flex theme-panel-bg shadow-2xl border-l border-white/10 pointer-events-auto overflow-hidden"
                style={{ width: 960 }}
                onPointerMove={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
              >
                {/* 좌측 사이드바 탭 (240px 0.5패널) */}
                <div className="w-[240px] shrink-0 border-r border-white/5 bg-black/10">
                  <SidebarMenu />
                </div>

                {/* 우측 분석 콘텐츠 (720px) */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* 콘텐츠 영역 헤더 — 설정모달 ContentHeader와 공통화 */}
                  <div className="px-6 py-4 border-b border-white/5 shrink-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {HeaderIcon && <HeaderIcon className="w-4 h-4 shrink-0 text-white/60" />}
                      <div className="flex-1 min-w-0">
                        <h2 className="text-[16px] font-black text-white">{currentTab?.label}</h2>
                      </div>
                    </div>
                    <button
                      onClick={handleClose}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="max-w-2xl">
                      {renderContent()}
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── 모바일: 수평 탭 구조 풀스크린 시트 ──
  return (
    <div style={themeStyle} className="contents">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="analytics-sheet-mobile"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 250 }}
            className={`fixed inset-0 z-[100] theme-panel-bg flex flex-col w-full h-full overflow-hidden pointer-events-auto ${
              isStandalone ? '' : 'pt-safe'
            }`}
            onPointerMove={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
              <div>
                <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  {getLabel('insightTitle', '인사이트 분석', { name: pixelInfo.displayName || '픽셀리어' })}
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 text-white/50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 수평 탭 스크롤 */}
            <div className="shrink-0 overflow-x-auto no-scrollbar border-b border-white/5 bg-black/10">
              <div className="flex gap-1.5 px-4 py-3 min-w-max">
                {tabsDef.map(tab => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black whitespace-nowrap transition-all shrink-0 ${
                        isActive ? 'bg-white text-black font-black' : 'bg-white/5 text-white/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 스크롤 가능한 상세 내용 */}
            <div className="flex-1 overflow-y-auto p-5 pb-safe-bottom">
              {renderContent()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
