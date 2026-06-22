/**
 * initGalaxyWarp — 은하 워프 시네마틱
 *
 * [Phase 3 Step 5] PixiApplication.tsx에서 추출
 * - galaxy-warp 커스텀 이벤트 리스너 등록/해제
 * - 4단계 시네마틱: Fade Out → 워프 플래시 → 데이터 교체 → Fade In
 * - 스피드 라인 DOM 이펙트 생성/삭제
 * - isCancelled/isWarpAnimating 상태 관리
 */
import * as PIXI from 'pixi.js'
import type { GalaxyCamera } from '@/shared/lib/pixi/camera'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { CAMERA_ZOOM } from '@/shared/constants/camera'
import { getLODLevel } from '@/shared/lib/pixi/lod'
import { GALAXY_CENTERS } from '@/shared/lib/pixi/coordinate'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import type { initDataSync } from './dataSync'

interface GalaxyWarpConfig {
  camera: GalaxyCamera
  worldContainer: PIXI.Container
  dataSync: ReturnType<typeof initDataSync>
  containerRef: React.RefObject<HTMLDivElement | null>
  worldOffsetX: number
  worldOffsetY: number
  isCancelledRef: { current: boolean }
  forceUpdateRef: { current: boolean }
}

export function initGalaxyWarp(config: GalaxyWarpConfig): {
  cleanup: () => void
} {
  const {
    camera,
    worldContainer,
    dataSync,
    containerRef,
    worldOffsetX,
    worldOffsetY,
    isCancelledRef,
    forceUpdateRef,
  } = config

  let isWarpAnimating = false
  let warpOverlay: HTMLDivElement | null = null
  const resetWarpState = () => {
    useGalaxyStore.getState().setIsGalaxyWarping(false)
    isWarpAnimating = false
    if (warpOverlay) {
      warpOverlay.remove()
      warpOverlay = null
    }
    worldContainer.alpha = 1
  }

  const handleGalaxyWarp = async (e: Event) => {
    const { galaxyKey, targetX, targetY, targetPixelId, zoom } = (
      e as CustomEvent
    ).detail
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }
    if (isWarpAnimating || !galaxyKey) return
    isWarpAnimating = true
    const targetCoord =
      GALAXY_CENTERS[galaxyKey as keyof typeof GALAXY_CENTERS]
    if (!targetCoord) {
      isWarpAnimating = false
      return
    }

    useGalaxyStore.getState().setIsGalaxyWarping(true)

    // ── Phase 1: Fade Out (250ms) ──
    await new Promise<void>((resolve) => {
      const start = performance.now()
      const animate = () => {
        const t = Math.min((performance.now() - start) / 250, 1)
        worldContainer.alpha = 1 - t
        if (t < 1) requestAnimationFrame(animate)
        else resolve()
      }
      requestAnimationFrame(animate)
    })
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }
    worldContainer.alpha = 0

    // ── Phase 2: 워프 플래시 이펙트 (데이터 로딩 대기 중 무한 루프) ──
    const panelOffset = useGalaxyStore.getState().pixelPanelWidth || 0
    const contentArea = document.getElementById("galaxy-content-area")
    const effectivePanelW = contentArea
      ? window.innerWidth - contentArea.clientWidth
      : panelOffset
    const centerLeftPct = (
      ((window.innerWidth - effectivePanelW) / 2 / window.innerWidth) *
      100
    ).toFixed(1)
    const centerTopPct = "50"

    warpOverlay = document.createElement("div")
    warpOverlay.style.cssText = `
      position: absolute; inset: 0; z-index: 50; pointer-events: none;
      background: radial-gradient(ellipse at ${centerLeftPct}% ${centerTopPct}%, rgba(99,102,241,0.3) 0%, transparent 70%);
      animation: warpFlash 600ms ease-out forwards;
    `
    // 스피드 라인 (데이터 로딩이 끝날 때까지 infinite 유지)
    for (let i = 0; i < 30; i++) {
      const line = document.createElement("div")
      const angle = Math.random() * 360
      const delay = Math.random() * 400
      const duration = 400 + Math.random() * 300
      const len = 40 + Math.random() * 60
      line.style.cssText = `
        position: absolute; top: ${centerTopPct}%; left: ${centerLeftPct}%;
        height: 1.5px;
        background: linear-gradient(90deg, transparent, rgba(165,180,252,${0.4 + Math.random() * 0.6}), transparent);
        transform: rotate(${angle}deg); transform-origin: left center;
        animation: warpLine ${duration}ms ${delay}ms infinite linear;
        opacity: 0;
      `
      warpOverlay.appendChild(line)
    }
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }
    containerRef.current?.appendChild(warpOverlay)

    if (!document.getElementById("warp-keyframes")) {
      const style = document.createElement("style")
      style.id = "warp-keyframes"
      style.textContent = `
        @keyframes warpFlash {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes warpLine {
          0% { opacity: 0; width: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; width: 100vw; }
        }
      `
      document.head.appendChild(style)
    }
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }

    // ── Phase 3: 데이터 교체 및 카메라 이동 ──
    const dataStart = performance.now()
    let toX = targetX ?? targetCoord.x * VISUAL_SCALE
    let toY = targetY ?? targetCoord.y * VISUAL_SCALE
    const toZoom = zoom ?? (targetPixelId ? CAMERA_ZOOM.PIXEL_FOCUS : 0.05)

    dataSync.switchGalaxyDomain(galaxyKey)

    if (targetPixelId) {
      try {
        const res = await fetch(`/api/users/${targetPixelId}/coordinates`)
        if (isCancelledRef.current) {
          resetWarpState()
          return
        }
        if (res.ok) {
          const d = await res.json()
          const gc = d.coordinates?.[galaxyKey]
          if (gc) {
            toX = gc.coordX * VISUAL_SCALE - worldOffsetX
            toY = gc.coordY * VISUAL_SCALE - worldOffsetY
          }
        }
      } catch (err) {
        console.error('Coordinate fetch error:', err)
      }
    }

    camera.warpTo(toX, toY)
    camera.zoomTo(toZoom, 0)
    // [FIX] 워프 즉시 Zustand 스토어의 viewport 좌표를 선제 동기화하여 이전 은하 영역의 백그라운드 쿼리 기동(좀비 잔상) 원천 차단
    useGalaxyStore.getState().setViewport({ x: toX, y: toY, zoom: toZoom })
    // [FIX] 줌 수축 시점의 LOD 정보도 스토어에 강제 동기화하여 첫 페이징/렌더가 정합된 축적(LOD 3)을 기준으로 한 프레임 지연 없이 작동하도록 보증
    useGalaxyStore.getState().setLOD(getLODLevel(toZoom))
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }

    // 데이터 페칭 완료 대기
    await dataSync.fetchPixelsInBBox(true)
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }

    // 최소 600ms 대기 보장 (데이터가 1ms만에 와도 워프 이펙트는 감상할 수 있도록)
    const dataElapsed = performance.now() - dataStart
    if (dataElapsed < 600) {
      await new Promise((r) => setTimeout(r, 600 - dataElapsed))
    }
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }

    // ── Phase 4: 워프 이펙트 종료 + Fade In (350ms) ──
    if (warpOverlay) {
      warpOverlay.style.transition = "opacity 350ms ease-out"
      warpOverlay.style.opacity = "0"
      const overlayToRemove = warpOverlay
      setTimeout(() => {
        if (!isCancelledRef.current) overlayToRemove.remove()
      }, 350)
    }

    await new Promise<void>((resolve) => {
      const start = performance.now()
      const animate = () => {
        const t = Math.min((performance.now() - start) / 350, 1)
        worldContainer.alpha = t
        if (t < 1) requestAnimationFrame(animate)
        else resolve()
      }
      requestAnimationFrame(animate)
    })
    if (isCancelledRef.current) {
      resetWarpState()
      return
    }
    worldContainer.alpha = 1

    const camVp = camera.viewport
    useGalaxyStore
      .getState()
      .setViewport({ x: camVp.x, y: camVp.y, zoom: camVp.zoom })
    useGalaxyStore.getState().setIsGalaxyWarping(false)
    isWarpAnimating = false
    const warpUser = useUserStore.getState().user?.id || null
    useGalaxyStore.getState().setHighlightedBondPixelId(warpUser)
    forceUpdateRef.current = true
  }

  window.addEventListener("galaxy-warp", handleGalaxyWarp)

  return {
    cleanup: () => {
      window.removeEventListener("galaxy-warp", handleGalaxyWarp)
      if (warpOverlay) {
        warpOverlay.remove()
        warpOverlay = null
      }
    },
  }
}
