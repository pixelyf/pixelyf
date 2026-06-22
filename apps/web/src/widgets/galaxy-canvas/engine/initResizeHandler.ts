/**
 * initResizeHandler — 캔버스 리사이즈 + 패널 오프셋 관리
 *
 * [Phase 3 Step 1] PixiApplication.tsx에서 추출
 * ResizeObserver 기반 캔버스 크기 동기화 및 패널 개폐 시 카메라 오프셋 관리
 */
import type * as PIXI from 'pixi.js'
import type { GalaxyCamera } from '@/shared/lib/pixi/camera'

interface ResizeHandlerConfig {
  pixiApp: PIXI.Application
  camera: GalaxyCamera
  containerElement: HTMLElement
  canvasSize: { current: { width: number; height: number } }
  layers: { background: PIXI.Graphics }
  swimmers: any[]
  dataSync: { debouncedFetch: () => void }
  initialExternalData?: any[]
  forceUpdateRef: { current: boolean }
}

export function initResizeHandler(config: ResizeHandlerConfig): {
  cleanup: () => void
} {
  const {
    pixiApp,
    camera,
    containerElement,
    canvasSize,
    layers,
    swimmers,
    dataSync,
    initialExternalData,
    forceUpdateRef,
  } = config

  // ── 캔버스 리사이즈 ──
  let resizeRaf: number | null = null
  const resizeObserver = new ResizeObserver((entries) => {
    if (resizeRaf !== null) return
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null
      const entry = entries[0]
      if (!entry || !pixiApp) return

      const w = Math.round(entry.contentRect.width)
      const h = Math.round(entry.contentRect.height)

      canvasSize.current = { width: w, height: h }
      pixiApp.renderer.resize(w, h)
      camera.setCanvasSize(w, h)
      camera.applyTransform()
      swimmers.forEach((s) =>
        s.relocate(
          camera.viewport.x,
          camera.viewport.y,
          camera.viewport.zoom,
        ),
      )
      // ── [ULTRA CRITICAL FIX] 윈도우 리사이즈 시 검은색 배경 도화지 렉트 크기를 늘어난 해상도(w, h)로 상시 동기화 ──
      layers.background.clear().rect(0, 0, w, h).fill(0x000000)
      forceUpdateRef.current = true
      if (!initialExternalData?.length) dataSync.debouncedFetch()
    })
  })

  resizeObserver.observe(containerElement)

  // ── 패널 개폐 카메라 오프셋 ──
  const contentArea = document.getElementById("galaxy-content-area")
  let uiOffsetRaf: number | null = null
  const contentObserver = new ResizeObserver((entries) => {
    if (uiOffsetRaf !== null) return
    uiOffsetRaf = requestAnimationFrame(() => {
      uiOffsetRaf = null
      const entry = entries[0]
      if (!entry || !pixiApp) return
      camera.setUiRightOffset(window.innerWidth - entry.contentRect.width)
      camera.applyTransform()
    })
  })
  if (contentArea) {
    contentObserver.observe(contentArea)
    camera.setUiRightOffset(window.innerWidth - contentArea.clientWidth)
  }

  return {
    cleanup: () => {
      resizeObserver.disconnect()
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
      contentObserver.disconnect()
      if (uiOffsetRaf !== null) cancelAnimationFrame(uiOffsetRaf)
    },
  }
}
