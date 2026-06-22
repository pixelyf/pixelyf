'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { CategoryFilter } from './CategoryFilter'

import { useGalaxyStore } from '@/stores/galaxyStore'

import { useUserStore } from '@/entities/user/model/useUserStore'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { CAMERA_ZOOM } from '@/shared/constants/camera'
import { createClient } from '@/shared/lib/supabase/browser'
import { PixelTooltip } from './PixelTooltip'
import { useTranslations } from 'next-intl'
import { GalaxyLoader } from './GalaxyLoader'

// SSR 차단 (PixiJS는 브라우저 WebGL 필요)
const PixiApplication = dynamic(
  () => import('./PixiApplication').then((mod) => mod.PixiApplication),
  { ssr: false }
)

// [CRITICAL LFC FIX] React 18의 핫리로드 및 마운트/언마운트 리렌더링 분기 속에서
// 브라우저 새로고침(F5) 시에만 단 1회 비동기 타겟 안착이 보장되도록 파일 렉시컬 스코프에 자동이동 상태를 영속 보존합니다.
let globalHasAutoMoved = false

export function GalaxyCanvas({ partnerCode }: { partnerCode?: string }) {
  const t = useTranslations('Galaxy')
  const selectedPixelId = useGalaxyStore((state) => state.selectedPixelId)
  const user = useUserStore((state) => state.user)
  const isLoading = useUserStore((state) => state.isLoading)

  // 모바일 디바이스 감지 (hover/wheel 이벤트 없음)
  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  }, [])

  
  const closeDrawer = () => useGalaxyStore.getState().selectPixel(null)
  const isSearchFeedOpen = useGalaxyStore((state) => state.isSearchFeedOpen)
  const pixelPanelWidth = useGalaxyStore((state) => state.pixelPanelWidth)
  const focusOnPosition = useGalaxyStore((state) => state.focusOnPosition)

  // [FIX Bug4] 유저 데이터 로딩 완료 후 내 픽셀 위치로 자동 이동 (최초 1회)
  // 단, URL 파라미터(pixel, feed)가 우선순위를 가집니다.
  // [FIX] 초기 URL 파라미터를 1회만 캡처 (매 렌더마다 new URLSearchParams → 참조 변경 → useEffect 무한 재실행 방지)
  const initialSearchParamsRef = useRef<URLSearchParams | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  )

  // [FIX] URL 딥링크 타겟 처리 전용 이펙트 (마운트 시 딱 1회만 실행 보장)
  // 의존성 배열을 비워 핫리로드 및 리렌더링 분기 속에서 클린업이 실행되어 비동기 쿼리와 그리드 인터벌이 무단 해제되는 레이스 컨디션을 원천 차단합니다.
  useEffect(() => {
    let isMounted = true
    let checkGridInterval: ReturnType<typeof setInterval> | null = null
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null

    const searchParams = initialSearchParamsRef.current
    const urlPixelId = searchParams?.get('pixel')
    const urlFeedId = searchParams?.get('feed')
    const targetId = urlPixelId || urlFeedId

    if (targetId && !globalHasAutoMoved) {
      console.log('[DEBUG-Canvas] URL Target Detected:', { urlPixelId, urlFeedId, targetId })
      // 즉시 hasAutoMoved 설정 → selectPixel의 URL 조작으로 인한 race condition 차단
      globalHasAutoMoved = true
      // 피드나 픽셀 상세로 직접 진입 시 검색 판넬 수동 강제 닫기
      useGalaxyStore.getState().setIsSearchFeedOpen(false)

      const initUrlTarget = async () => {
        const supabase = createClient()
        let fetchPixelId: string | null = targetId
        
        if (urlFeedId) {
          try {
            console.log('[DEBUG-Canvas] Querying Moments table for Feed ID:', urlFeedId)
            const { data: feed } = await supabase.from('moments').select('user_id').eq('id', urlFeedId).maybeSingle()
            console.log('[DEBUG-Canvas] Moments Query Success. Result:', feed)
            if (feed) {
              fetchPixelId = feed.user_id
            } else {
              fetchPixelId = null
            }
          } catch (error) {
            console.error('[DEBUG-Canvas] Moments Query Failed:', error)
            fetchPixelId = null
          }
        }

        if (!fetchPixelId) {
          console.log('[DEBUG-Canvas] No fetchPixelId found, aborting initUrlTarget.')
          return
        }
        const targetPixelId = fetchPixelId
        console.log('[DEBUG-Canvas] targetPixelId resolved:', targetPixelId)

        try {
          console.log('[DEBUG-Canvas] Querying Users table for targetPixelId:', targetPixelId)
          const { data: userResult } = await supabase.from('users').select(`
            display_name,
            supernova_tier,
            current_mood_id,
            user_coordinates ( coord_x, coord_y, z_depth, galaxy_key, rank )
          `).eq('id', targetPixelId).maybeSingle()

          console.log('[DEBUG-Canvas] Users Query Success. Result:', userResult)

          if (userResult) {
            const currentGalaxyKey = useGalaxyStore.getState().galaxyKey;
            let coords = null;
            if (Array.isArray(userResult.user_coordinates)) {
              coords = userResult.user_coordinates.find((c: any) => c.galaxy_key === currentGalaxyKey) || userResult.user_coordinates[0];
            } else {
              coords = userResult.user_coordinates;
            }
            let x = 0, y = 0
            let hasCoords = false
            if (coords) {
              x = coords.coord_x * VISUAL_SCALE
              y = coords.coord_y * VISUAL_SCALE
              hasCoords = true
            }
            console.log('[DEBUG-Canvas] Coordinates resolved:', { x, y, hasCoords, coords })

            // 캔버스 엔진 마운트 전에 스토어 뷰포트 상태를 선제적으로 박제 동기화!
            if (hasCoords) {
              console.log('[DEBUG-Canvas] Pre-hydrating store viewport to:', { x, y, zoom: CAMERA_ZOOM.PIXEL_FOCUS })
              useGalaxyStore.getState().setViewport({
                x,
                y,
                zoom: CAMERA_ZOOM.PIXEL_FOCUS
              })
            }

            // PixiJS 엔진 초기화 대기 후 삽입 및 선택 (Race condition 방지)
            console.log('[DEBUG-Canvas] Starting Grid & PixiReady Wait Interval...')
            checkGridInterval = setInterval(() => {
              if (!isMounted) {
                console.log('[DEBUG-Canvas] Component unmounted, clearing interval.')
                if (checkGridInterval) clearInterval(checkGridInterval)
                return
              }
              const store = useGalaxyStore.getState()
              console.log('[DEBUG-Canvas] Interval check. isPixiReady:', store.isPixiReady, 'hasGrid:', !!store.spatialGrid)
              if (store.isPixiReady && store.spatialGrid) {
                console.log('[DEBUG-Canvas] Pixi is Ready and SpatialGrid loaded. Clearing check interval.')
                if (checkGridInterval) clearInterval(checkGridInterval)
                if (!store.spatialGrid.getPixel(targetPixelId)) {
                  console.log('[DEBUG-Canvas] Target pixel missing in spatialGrid. Upserting custom pixel data.')
                  store.spatialGrid.upsert({
                    pixelId: targetPixelId,
                    coordX: x,
                    coordY: y,
                    zDepth: coords?.z_depth ?? 1,
                    displayName: userResult.display_name || t('defaultPixeler'),
                    supernovaTier: userResult.supernova_tier,
                    glowColorPrimary: '#818CF8',
                    glowColorSecondary: '#C084FC',
                    moodId: userResult.current_mood_id,
                    rank: coords?.rank,
                  } as any)
                }
                console.log('[DEBUG-Canvas] Triggering selectPixel for:', targetPixelId)
                store.selectPixel(targetPixelId)
                
                // 데이터 삽입 및 Pixi 엔진 준비 완료 직후 카메라 이동 (좌표가 존재하는 경우에만 50% 줌 워프 수행)
                if (hasCoords) {
                  console.log('[DEBUG-Canvas] Triggering focusOnPosition for:', { x, y })
                  store.focusOnPosition(x, y, CAMERA_ZOOM.PIXEL_FOCUS, true)
                }
              }
            }, 100)
            
            // 안전 장치: 5초 후에도 안되면 정리
            fallbackTimeout = setTimeout(() => {
              console.log('[DEBUG-Canvas] Fallback timeout triggered. Clearing interval.')
              if (checkGridInterval) clearInterval(checkGridInterval)
            }, 5000)
          } else {
             console.log('[DEBUG-Canvas] User profile data not found in DB. Selecting target id anyway.')
             useGalaxyStore.getState().selectPixel(targetPixelId)
          }
        } catch (error) {
          console.error('[DEBUG-Canvas] Exception in initUrlTarget:', error)
          useGalaxyStore.getState().selectPixel(targetPixelId)
        }
      }
      initUrlTarget()
    }

    return () => {
      isMounted = false
      if (checkGridInterval) clearInterval(checkGridInterval)
      if (fallbackTimeout) clearTimeout(fallbackTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // [FIX] 로그인 유저의 최초 자동 안착 처리 전용 이펙트 (URL 타겟 진입 시 실행 안 됨)
  useEffect(() => {
    const searchParams = initialSearchParamsRef.current
    const urlPixelId = searchParams?.get('pixel')
    const urlFeedId = searchParams?.get('feed')
    const hasUrlTarget = !!(urlPixelId || urlFeedId)

    if (!globalHasAutoMoved && !isLoading && !hasUrlTarget && user) {
      const currentGalaxyKey = useGalaxyStore.getState().galaxyKey
      const galaxyCoord = user.coordinates?.[currentGalaxyKey]
      
      if (galaxyCoord) {
        // 파트너 은하: coordinates 맵에서 해당 은하 좌표 사용
        focusOnPosition(galaxyCoord.x * VISUAL_SCALE, galaxyCoord.y * VISUAL_SCALE, CAMERA_ZOOM.PIXEL_FOCUS)
        globalHasAutoMoved = true
      } else if (currentGalaxyKey === 'PIXELYF' && user.coordX != null && user.coordY != null) {
        // 기본 은하: 레거시 coordX/coordY 사용
        focusOnPosition(user.coordX * VISUAL_SCALE, user.coordY * VISUAL_SCALE, CAMERA_ZOOM.PIXEL_FOCUS)
        globalHasAutoMoved = true
      } else {
        // 미참여 은하 또는 좌표 없음: 은하 중심에 유지 (포커스 안 함)
        globalHasAutoMoved = true
      }
    }
  }, [user, isLoading, focusOnPosition])

  // [HTML TOOLTIP] pixel-hover 이벤트 수신 (데스크탑: pointerover, 모바일: 싱글탭)
  const [hoverPixel, setHoverPixel] = useState<{
    pixelId: string; screenX: number; screenY: number; scaledRadius?: number;
    displayName?: string; momentContent?: string; momentThumbnail?: string;
    country?: string; isMobileTap?: boolean;
  } | null>(null)

  useEffect(() => {
    const handler = (e: Event) => setHoverPixel((e as CustomEvent).detail)
    window.addEventListener('pixel-hover', handler)
    return () => window.removeEventListener('pixel-hover', handler)
  }, [])

  // [GHOST FIX] 휠 줌 시 pointerout 미발생으로 인한 유령 말풍선 제거 (데스크탑 전용)
  useEffect(() => {
    if (isMobileDevice) return
    const clearOnWheel = () => setHoverPixel(null)
    window.addEventListener('wheel', clearOnWheel, { passive: true })
    return () => window.removeEventListener('wheel', clearOnWheel)
  }, [isMobileDevice])

  // [MOBILE] 판넬이 열리면 tooltip 자동 dismiss (selectPixel이 호출된 경우)
  useEffect(() => {
    if (selectedPixelId && isMobileDevice) {
      setHoverPixel(null)
    }
  }, [selectedPixelId, isMobileDevice])

  return (
    <div data-tour="canvas" className="absolute inset-0 z-0 overflow-hidden bg-midnight-ink">

      {/* ── 은하 중심 앵커 (투어 가이드용) ── */}
      <div 
        data-tour="canvas-center" 
        className="absolute top-1/2 left-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 pointer-events-none" 
      />

      {/* ── 카테고리 필터 바 ── */}
      <CategoryFilter />

      {/* ── PixiJS Canvas ── */}
      {/* canvas는 헤더/필터 뒤에서 전체를 차지 (z-index 0) */}
      <div className="absolute inset-0 z-0 outline-none">
        <Suspense fallback={
          <GalaxyLoader progress={0} status="Initializing Engine..." />
        }>
          <PixiApplication partnerCode={partnerCode} />
        </Suspense>
      </div>

      {/* ── HTML 말풍선 (데스크탑: hover, 모바일: 탭 프리뷰) ── */}
      <PixelTooltip data={hoverPixel} />
    </div>
  )
}

