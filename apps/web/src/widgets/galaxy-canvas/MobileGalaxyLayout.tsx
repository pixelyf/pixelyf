'use client'

import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { PenTool, ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { isNativeApp } from '@/shared/utils/isNativeApp'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useToastStore } from '@/stores/toastStore'
import { useTranslations } from 'next-intl'
import { SearchFeedDrawer } from './SearchFeedDrawer'
import { PixelDetailDrawer } from './PixelDetailDrawer'
import { GalaxyHeader } from './GalaxyHeader'
import { MobileSideDrawer } from './MobileSideDrawer'
import { MobileSearchOverlay } from './MobileSearchOverlay'
import { MobileBottomTabBar } from './MobileBottomTabBar'
import { MobileNotificationDrawer } from './MobileNotificationDrawer'
import { GalaxyMinimap } from './GalaxyMinimap'
import { MomentModal } from './MomentModal'
import { useRouter } from '@/i18n/navigation'
import { stripLocalePrefix } from '@/shared/lib/i18n/stripLocalePrefix'
import { GalaxyLoader } from './GalaxyLoader'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { AnimatePresence } from 'framer-motion'
import { DmRoomDrawer } from '@/widgets/dm/DmRoomDrawer'
import { useScrollLock } from '@/shared/hooks/useScrollLock'

// ── 생각그래프 ──
import { ThoughtGraphToggle } from './ThoughtGraphToggle'
import { ThoughtGraphScopeFilter } from './ThoughtGraphScopeFilter'
import { ThoughtDetailDrawer } from './ThoughtDetailDrawer'
import { ThoughtGraphToast } from './ThoughtGraphToast'
import { ThoughtGraphEmptyState } from './ThoughtGraphEmptyState'

// [CANVAS ON-DEMAND] 탐험 탭에서만 로드 → 피드 탭 성능에 영향 없음
const GalaxyCanvas = lazy(() =>
  import('./GalaxyCanvas').then(mod => ({ default: mod.GalaxyCanvas }))
)

type MobileViewMode = 'feed' | 'canvas'

interface MobileGalaxyLayoutProps {
  partnerCode?: string
}

/**
 * 모바일 레이아웃 (Phase 1 + 캔버스 모드):
 * - 피드 모드: SearchFeedDrawer 풀스크린
 * - 캔버스 모드: GalaxyCanvas + GalaxyMinimap(토글) + 오버레이
 * - GalaxyHeader: 모든 모드에서 항상 표시
 */
export function MobileGalaxyLayout({ partnerCode }: MobileGalaxyLayoutProps) {
  useScrollLock()
  const isMomentModalOpen = useGalaxyStore(s => s.isMomentModalOpen)
  const setIsMomentModalOpen = useGalaxyStore(s => s.setIsMomentModalOpen)
  const user = useUserStore(s => s.user)
  const addToast = useToastStore(s => s.addToast)
  const tMoment = useTranslations('Moment')
  const canvasViewMode = useGalaxyStore(s => s.viewMode) // 'pixelyer' | 'thoughtGraph'
  const isThoughtGraphLoading = useGalaxyStore(s => s.isThoughtGraphLoading)
  const thoughtNodes = useGalaxyStore(s => s.thoughtNodes)
  const isPixiReady = useGalaxyStore(s => s.isPixiReady)
  const activeDmRoomId = useGalaxyStore(s => s.activeDmRoomId)
  const selectedPixelId = useGalaxyStore(s => s.selectedPixelId)
  
  const router = useRouter()
  const [isSideDrawerOpen, setIsSideDrawerOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const viewMode = useGalaxyStore(s => s.mobileViewMode)
  const setViewMode = useGalaxyStore(s => s.setMobileViewMode)
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false)
  const [isCanvasReady, setIsCanvasReady] = useState(false)

  // [UX 고도화] 생각그래프 전환 시 최소 1.5초 로딩 애니메이션 보장 로직 (데스크톱 사양 피팅)
  const [showOverlay, setShowOverlay] = useState(false)
  const loadingStartTimeRef = useRef<number>(0)
  const prevViewModeRef = useRef<string>('pixelyer')

  // React Native WebView 내부 실행 여부 감지
  const isNative = isNativeApp()



  // ── 네이티브 탭 전환 이벤트 수신 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const isSettingsOpen = stripLocalePrefix(window.location.pathname) === '/settings' || useGalaxyStore.getState().isSettingsOpen

      if (detail === 'explore' || detail === 'canvas') {
        setViewMode('canvas')
        if (isSettingsOpen) {
          useGalaxyStore.getState().setIsSettingsOpen(false)
          router.back()
        } else router.push('/')
      } else if (detail === 'feed' || detail === 'home') {
        setViewMode('feed')
        useGalaxyStore.getState().selectPixel(null)
        if (isSettingsOpen) {
          useGalaxyStore.getState().setIsSettingsOpen(false)
          router.back()
        } else router.push('/')
        window.dispatchEvent(new CustomEvent('SWITCH_FEED_SCOPE', { detail: 'global' }))
      } else if (detail === 'bonds') {
        setViewMode('feed')
        useGalaxyStore.getState().selectPixel(null)
        if (isSettingsOpen) {
          useGalaxyStore.getState().setIsSettingsOpen(false)
          router.back()
        } else router.push('/')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('SWITCH_FEED_SCOPE', { detail: 'bonds' }))
        }, 50)
      } else if (detail === 'profile') {
        // [Profile Tab] 설정 페이지로 소프트 라우팅 (Zustand + pushState 사용)
        useGalaxyStore.getState().setIsSettingsOpen(true)
        window.history.pushState(null, '', '/settings')
      }
    }
    window.addEventListener('NAVIGATE_TAB', handler)
    return () => window.removeEventListener('NAVIGATE_TAB', handler)
  }, [router])

  // ── 헤더 스크롤 연동 이벤트 수신 (Smooth Transition 방식) ──
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail?.visible === 'boolean') {
        setIsHeaderVisible(detail.visible)
      }
    }
    window.addEventListener('mobile-header-visibility', handler)
    return () => window.removeEventListener('mobile-header-visibility', handler)
  }, [])

  // 캔버스 렌더링 지연 스케줄링 (탭 전환 터치 성능 극대화 및 메인 스레드 렉 분산)
  useEffect(() => {
    if (viewMode === 'canvas') {
      setIsCanvasReady(false)
      const timer = setTimeout(() => {
        setIsCanvasReady(true)
      }, 150)
      return () => clearTimeout(timer)
    } else {
      setIsCanvasReady(false)
      // 캔버스 이탈 시 렌더 준비 상태를 즉시 false로 초기화하여 재진입 시 오프라인 레이스 컨디션을 예방
      useGalaxyStore.getState().setIsPixiReady(false)
    }
  }, [viewMode])

  // 생각그래프 전환 시 최소 1.5초 양방향 로고 스피너 오버레이 보장 스케줄러 (데스크톱 사양)
  useEffect(() => {
    let timer: NodeJS.Timeout
    const prevViewMode = prevViewModeRef.current
    prevViewModeRef.current = canvasViewMode

    if (canvasViewMode === 'thoughtGraph') {
      if (isThoughtGraphLoading) {
        setShowOverlay(true)
        loadingStartTimeRef.current = Date.now()
      } else {
        // 경과 시간 계산하여 최소 1.5초 보장
        const elapsedTime = Date.now() - loadingStartTimeRef.current
        const remainingTime = Math.max(0, 1500 - elapsedTime)

        timer = setTimeout(() => {
          setShowOverlay(false)
        }, remainingTime)
      }
    } else if (canvasViewMode === 'pixelyer' && prevViewMode === 'thoughtGraph') {
      // 생각그래프에서 픽셀은하로 복귀하는 최초 시점
      setShowOverlay(true)
      timer = setTimeout(() => {
        setShowOverlay(false)
      }, 1500) // 1.5초 복귀 오버레이 보장
    } else {
      setShowOverlay(false)
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [canvasViewMode, isThoughtGraphLoading])

  // ── 네이티브 기록하기 브릿지 이벤트 수신 ──
  useEffect(() => {
    const handler = () => {
      if (!user) {
        addToast({
          type: 'error',
          title: tMoment('loginForPing'),
        })
        return
      }
      setIsMomentModalOpen(true)
    }
    window.addEventListener('OPEN_MOMENT_MODAL', handler)
    return () => window.removeEventListener('OPEN_MOMENT_MODAL', handler)
  }, [setIsMomentModalOpen, user, addToast, tMoment])

  // 검색 상태는 SearchFeedDrawer와 공유 (이벤트 기반)
  const [mobileSearchTerm, setMobileSearchTerm] = useState('')
  const [mobileSearchMode, setMobileSearchMode] = useState<'content' | 'nickname'>('content')

  const handleSearchChange = (term: string) => {
    setMobileSearchTerm(term)
    window.dispatchEvent(new CustomEvent('mobile-search-update', {
      detail: { searchTerm: term, searchMode: mobileSearchMode }
    }))
  }

  const handleSearchModeChange = (mode: 'content' | 'nickname') => {
    setMobileSearchMode(mode)
    window.dispatchEvent(new CustomEvent('mobile-search-update', {
      detail: { searchTerm: mobileSearchTerm, searchMode: mode }
    }))
  }

  // 미니맵 너비 (160px 본체 + 3px 패딩 좌우 + 2px 보더)
  const MINIMAP_TOTAL_WIDTH = 168

  return (
    <div 
      className={`relative w-full flex flex-col ${viewMode === 'feed' ? 'min-h-screen h-auto' : 'h-full'}`} 
      style={{ backgroundColor: '#0b0f10' }}
    >
      {/* ── 모바일 헤더 — 네이티브 캔버스 모드에서는 숨김 (44px 확보), 피드 모드에서는 유지 (검색/은하 전환 접근성) ── */}
      <div 
        id="mobile-header-wrapper"
        className={`fixed top-0 left-0 w-full z-50 bg-[#0b0f10] transition-transform duration-300 ease-in-out ${
          isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        {!(isNative && viewMode === 'canvas') && (
          <div className={`transition-opacity duration-300 ease-in-out ${isHeaderVisible ? 'opacity-100' : 'opacity-0'}`}>
            <GalaxyHeader
              onMenuOpen={() => setIsSideDrawerOpen(true)}
              onSearchOpen={() => setIsSearchOpen(true)}
            />
          </div>
        )}
      </div>

      {/* ── 캔버스 전용 플로팅 메뉴 (헤더가 감춰질 때 우측 상단에 단독 노출) ── */}
      {isNative && viewMode === 'canvas' && (
        <div className="absolute top-0 right-0 z-[60] px-4 h-14 flex items-center pointer-events-none">
          <button
            onClick={() => setIsSideDrawerOpen(true)}
            className="pointer-events-auto p-2 text-white/80 hover:text-white transition-all active:scale-90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            aria-label="메뉴 열기"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* ── 메인 컨텐츠 영역 ── */}
      <div 
        className={`w-full relative ${viewMode === 'feed' ? 'h-auto' : 'flex-1 min-h-0'}`}
      >

        {/* ── 피드 모드 ── */}
        {viewMode === 'feed' && (
          <>
            <SearchFeedDrawer />
            {selectedPixelId && <PixelDetailDrawer />}
          </>
        )}

        {/* ── 캔버스 모드 ── */}
        {viewMode === 'canvas' && (
          <div className="relative w-full h-full">
            {isCanvasReady ? (
              <Suspense fallback={
                <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f10] z-40">
                  <LogoSpinner size={56} />
                </div>
              }>
                <GalaxyCanvas partnerCode={partnerCode} />
              </Suspense>
            ) : null}

            {/* PixiJS 엔진 초기화 및 픽셀 렌더 준비(isPixiReady)까지 로고 스피너 오버레이 완벽 유지 */}
            {(!isCanvasReady || !isPixiReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f10] z-50">
                <LogoSpinner size={56} />
              </div>
            )}

            {/* ── 픽셀리어 전용 UI ── */}
            {canvasViewMode === 'pixelyer' && (
              <>
                {/* 미니맵 (우하단, 토글 가능) */}
                <div
                  className="absolute z-[30] pointer-events-auto"
                  style={{
                    right: 0,
                    bottom: isNative ? 68 : 8,
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isMinimapCollapsed ? `translateX(${MINIMAP_TOTAL_WIDTH}px)` : 'translateX(0)',
                  }}
                >
                  <button
                    onClick={() => setIsMinimapCollapsed(!isMinimapCollapsed)}
                    className="absolute -left-8 top-1/2 -translate-y-1/2 w-8 h-12 flex items-center justify-center bg-slate-900/80 backdrop-blur-md border border-white/10 border-r-0 rounded-l-xl text-white/60 active:text-white active:bg-slate-800/80 transition-all z-[31] shadow-lg"
                    title={isMinimapCollapsed ? '미니맵 열기' : '미니맵 닫기'}
                  >
                    {isMinimapCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <GalaxyMinimap
                    partnerCode={partnerCode}
                    positionClassName="relative pointer-events-auto flex flex-col gap-2 pr-2"
                  />
                </div>

                {/* PixelDetailDrawer (캔버스에서 픽셀 탭 시) */}
                <PixelDetailDrawer />
              </>
            )}

            {/* ── 생각그래프 양방향 전환 오버레이 (데스크톱 사양과 완벽 동기화) ── */}
            {showOverlay && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-[#05050A] animate-out fade-out duration-500">
                <LogoSpinner size={80} className="drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]" />
              </div>
            )}

            {/* ── 생각그래프 피드 없음 안내 (Empty State) ── */}
            {canvasViewMode === 'thoughtGraph' && !isThoughtGraphLoading && thoughtNodes.length === 0 && (
              <ThoughtGraphEmptyState />
            )}
          </div>
        )}
      </div>

      {/* ── 사이드 드로어 (은하 전환 + 카테고리 + 설정) ── */}
      <MobileSideDrawer
        isOpen={isSideDrawerOpen}
        onClose={() => setIsSideDrawerOpen(false)}
        currentViewMode={viewMode}
      />

      {/* ── 모바일 웹 전용 하단 네비게이션 ── */}
      {!isNative && <MobileBottomTabBar />}

      {/* ── 모바일 알림 드로어 ── */}
      <MobileNotificationDrawer />

      {/* ── 검색 오버레이 ── */}
      <MobileSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        searchTerm={mobileSearchTerm}
        onSearchChange={handleSearchChange}
        searchMode={mobileSearchMode}
        onSearchModeChange={handleSearchModeChange}
      />

      {/* ── 기록하기 모달 (모바일 최적화 풀팝업) ── */}
      <MomentModal 
        isOpen={isMomentModalOpen} 
        onClose={() => setIsMomentModalOpen(false)}
        bgColor="bg-[#0b0f10]"
      />

      {/* [생각그래프] 플로팅 UI (캔버스 모드에서만 활성화) */}
      {viewMode === 'canvas' && (
        <>
          <ThoughtGraphToggle />
          <ThoughtGraphScopeFilter />
          <ThoughtDetailDrawer />
          <ThoughtGraphToast />
        </>
      )}

      {/* [전역] DM 오버레이 — 픽셀 선택 상태와 독립적으로 동작 */}
      <AnimatePresence>
        {activeDmRoomId && (
          <DmRoomDrawer roomId={activeDmRoomId} isOverlay={true} />
        )}
      </AnimatePresence>
    </div>
  )
}
