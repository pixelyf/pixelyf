'use client'

import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { MobileGalaxyLayout } from './MobileGalaxyLayout'
import { useState, useEffect, useRef, Component, ReactNode, useMemo } from 'react'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { usePopStateSync } from '@/shared/hooks/usePopStateSync'
import { SettingsModal } from '@/widgets/galaxy-canvas/SettingsModal'
import { MomentModal } from './MomentModal'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { stripLocalePrefix } from '@/shared/lib/i18n/stripLocalePrefix'
import { AnimatePresence } from 'framer-motion'

// ── 캔버스 관련 (데스크탑 only) ──
import { GalaxyCanvas } from '@/widgets/galaxy-canvas/GalaxyCanvas'
import { GalaxyHeader } from '@/widgets/galaxy-canvas/GalaxyHeader'
import { GalaxyMinimap } from '@/widgets/galaxy-canvas/GalaxyMinimap'
import { GalaxyNameBadge } from '@/widgets/galaxy-canvas/GalaxyNameBadge'
import { AuraHubButton } from '@/widgets/galaxy-canvas/AuraHubButton'
import { GalaxyContextOverlay } from '@/widgets/galaxy-canvas/GalaxyContextOverlay'
import { SearchFeedDrawer } from '@/widgets/galaxy-canvas/SearchFeedDrawer'
import { PixelDetailDrawer } from '@/widgets/galaxy-canvas/PixelDetailDrawer'
import { GalaxyTourGuide } from './GalaxyTourGuide'


// ── 생각그래프 ──
import { ThoughtDetailDrawer } from '@/widgets/galaxy-canvas/ThoughtDetailDrawer'
import { ThoughtGraphToast } from '@/widgets/galaxy-canvas/ThoughtGraphToast'
import { useThoughtGraph } from '@/widgets/galaxy-canvas/useThoughtGraph'
import { ThoughtGraphEmptyState } from './ThoughtGraphEmptyState'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { DmRoomDrawer } from '@/widgets/dm/DmRoomDrawer'
import { GalaxyLoadingShell } from './GalaxyLoadingShell'

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-500 bg-black w-full h-full overflow-auto">
          <h1 className="text-xl font-bold">Rendering Error</h1>
          <pre className="text-xs mt-2">{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 모바일/데스크탑 레이아웃을 분기하는 클라이언트 컴포넌트.
 * SSR(page.tsx)에서 렌더링한 SEO 레이어 아래에 마운트됩니다.
 */
function GalaxyLayoutSwitchInner() {
  const storeGalaxyKey = useGalaxyStore(s => s.galaxyKey)
  const setGalaxyKey = useGalaxyStore(s => s.setGalaxyKey)
  const { galaxies, rootGalaxy } = useGalaxySystem()

  // 유효하지 않은 기본 은하 키(PIXELYF) 방어 로직 추가
  useEffect(() => {
    if (!galaxies || galaxies.length === 0) return

    const pathname = stripLocalePrefix(window.location.pathname)
    const segments = pathname.split('/').filter(Boolean)
    
    let hasMatchingSlug = false
    const SYSTEM_PATHS = new Set([
      'admin', 'analytics', 'auth', 'brand',
      'dm', 'my-galaxy', 'onboarding', 'settings',
    ])
    
    if (segments.length > 0) {
      const slug = segments[0]
      if (!SYSTEM_PATHS.has(slug)) {
        const matchingGalaxy = galaxies.find(g => g.partnerCode === slug)
        if (matchingGalaxy) {
          hasMatchingSlug = true
        }
      }
    }

    const isValidKey = galaxies.some(g => g.key === storeGalaxyKey)
    if (!hasMatchingSlug && !isValidKey && rootGalaxy) {
      setGalaxyKey(rootGalaxy.key as any)
    }
  }, [galaxies, storeGalaxyKey, rootGalaxy, setGalaxyKey])

  // 클라이언트 최초 하이드레이션 시, 스토어 상태 변경(useEffect) 전이라도
  // 브라우저의 URL 경로를 선제 파싱하여 올바른 galaxyKey 및 partnerCode를 즉시 반환함으로써
  // 엔진(PixiApplication)이 엉뚱한 기본 은하('PIXELYF')로 마운트되는 대참사를 방지합니다.
  const galaxyKey = useMemo(() => {
    if (typeof window === 'undefined' || !galaxies?.length) return storeGalaxyKey

    // 시스템 예약 경로 — 파트너 은하 슬러그로 오인되어서는 안 되는 경로 목록
    // apps/web/src/app/[locale] 하위 최상위 디렉토리 기준
    const SYSTEM_PATHS = new Set([
      'admin', 'analytics', 'auth', 'brand',
      'dm', 'my-galaxy', 'onboarding', 'settings',
    ])

    const pathname = stripLocalePrefix(window.location.pathname)
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length > 0) {
      const slug = segments[0]
      if (!SYSTEM_PATHS.has(slug)) {
        const matchingGalaxy = galaxies.find(g => g.partnerCode === slug)
        if (matchingGalaxy) return matchingGalaxy.key
      }
    }
    return storeGalaxyKey
  }, [storeGalaxyKey, galaxies])

  const partnerCode = useMemo(() => {
    const galaxy = galaxies.find(g => g.key === galaxyKey)
    return galaxy?.partnerCode || 'pixelyf'
  }, [galaxyKey, galaxies])

  const isMobile = useMediaQuery('(max-width: 767px)')
  const [mounted, setMounted] = useState(false)
  const isSettingsOpen = useGalaxyStore(s => s.isSettingsOpen)
  const setIsSettingsOpen = useGalaxyStore(s => s.setIsSettingsOpen)
  const isMomentModalOpen = useGalaxyStore(s => s.isMomentModalOpen)
  const setIsMomentModalOpen = useGalaxyStore(s => s.setIsMomentModalOpen)
  const viewMode = useGalaxyStore(s => s.viewMode)
  const isThoughtGraphLoading = useGalaxyStore(s => s.isThoughtGraphLoading)
  const thoughtNodes = useGalaxyStore(s => s.thoughtNodes)
  const activeDmRoomId = useGalaxyStore(s => s.activeDmRoomId)

  // [UX 고도화] 최소 1.5초 애니메이션 보장 로컬 상태 및 타이머
  const [showOverlay, setShowOverlay] = useState(false)
  const loadingStartTimeRef = useRef<number>(0)
  const prevViewModeRef = useRef<string>('pixelyer')

  useEffect(() => {
    let timer: NodeJS.Timeout
    const prevViewMode = prevViewModeRef.current
    prevViewModeRef.current = viewMode

    if (viewMode === 'thoughtGraph') {
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
    } else if (viewMode === 'pixelyer' && prevViewMode === 'thoughtGraph') {
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
  }, [viewMode, isThoughtGraphLoading])

  // 브라우저 뒤로 가기/앞으로 가기 동기화
  usePopStateSync()

  useEffect(() => {
    setMounted(true)
  }, [])

  // [생각그래프] 데이터 fetch 훅
  useThoughtGraph()

  // SSR 및 하이드레이션 이전에는 빈 화면(또는 스켈레톤)을 렌더링하여 화면 깨짐 방지
  if (!mounted) {
    return <GalaxyLoadingShell progress={0} status="Preparing Shell..." />
  }

  const handleCloseSettings = () => {
    setIsSettingsOpen(false)
    if (typeof window !== 'undefined') {
      const pathname = stripLocalePrefix(window.location.pathname)
      if (pathname === '/settings') {
        window.history.back()
      }
    }
  }

  // ── 모바일: 캔버스 없이 피드 + 프로필만 ──
  if (isMobile) {
    return (
      <>
        <MobileGalaxyLayout partnerCode={partnerCode} />
        <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      </>
    )
  }

  // ── 데스크탑: 기존 레이아웃 유지 ──
  return (
    <>
      {/* Layer 0: Canvas — viewMode 무관하게 항상 마운트 (좌표 유지) */}
      <GalaxyCanvas partnerCode={partnerCode} />

      {/* 최초 방문자용 UI/UX 툴팁 가이드 오버레이 */}
      <GalaxyTourGuide />

      {/* Layer 1: UI Flex */}
      <div className="absolute inset-0 z-10 flex flex-row pointer-events-none">
        <div id="galaxy-content-area" className="flex-1 flex flex-col min-w-0 pointer-events-none">
          <GalaxyHeader />
          <div className="flex-1 relative">
            {/* 픽셀리어 전용 UI — 생각그래프 모드에서는 숨김 */}
            {viewMode === 'pixelyer' && (
              <>
                <GalaxyMinimap partnerCode={partnerCode} />
                <GalaxyNameBadge />
                <AuraHubButton />
                <GalaxyContextOverlay />
              </>
            )}

            {/* ── 픽셀은하 ↔ 생각그래프 양방향 전환 오버레이 ── */}
            {showOverlay && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-[#05050A] animate-out fade-out duration-500">
                <LogoSpinner size={80} className="drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]" />
              </div>
            )}

            {/* ── 생각그래프 피드 없음 안내 (Empty State) ── */}
            {viewMode === 'thoughtGraph' && !showOverlay && thoughtNodes.length === 0 && (
              <ThoughtGraphEmptyState />
            )}

            {/* 생각그래프 전용 플로팅 UI 제거 — CategoryFilter에 텍스트 형태로 통합 병합됨 */}
          </div>
        </div>

        {/* 사이드바 — 픽셀리어에서만 표시 */}
        {viewMode === 'pixelyer' && (
          <>
            <SearchFeedDrawer />
            <PixelDetailDrawer />
          </>
        )}

        {/* 사이드바 — 생각그래프에서 표시 */}
        {viewMode === 'thoughtGraph' && (
          <ThoughtDetailDrawer />
        )}
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      <MomentModal isOpen={isMomentModalOpen} onClose={() => setIsMomentModalOpen(false)} />

      {/* [생각그래프] 전역 알림 */}
      <ThoughtGraphToast />

      {/* [전역] DM 오버레이 — 픽셀 선택 상태와 독립적으로 동작 */}
      <AnimatePresence>
        {activeDmRoomId && (
          <DmRoomDrawer roomId={activeDmRoomId} isOverlay={true} />
        )}
      </AnimatePresence>
    </>
  )
}

export function GalaxyLayoutSwitch() {
  return (
    <ErrorBoundary>
      <GalaxyLayoutSwitchInner />
    </ErrorBoundary>
  )
}
