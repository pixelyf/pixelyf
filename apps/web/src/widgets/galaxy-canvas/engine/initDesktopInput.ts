/**
 * initDesktopInput — 데스크탑 마우스/드래그/휠/더블클릭 입력 핸들러
 *
 * [Phase 3 Step 2] PixiApplication.tsx에서 추출
 * pointerdown/pointermove/pointerup/pointertap + 휠 줌 핸들러
 */
import * as PIXI from 'pixi.js'
import type { GalaxyCamera } from '@/shared/lib/pixi/camera'
import { createWheelHandler } from './initCamera'
import { useGalaxyStore } from '@/stores/galaxyStore'

interface DesktopInputConfig {
  canvas: HTMLCanvasElement
  pixiApp: PIXI.Application
  camera: GalaxyCamera
  worldContainer: PIXI.Container
  layers: { background: PIXI.Graphics }
  entranceRef: { current: ReturnType<typeof setTimeout> | null }
}

export function initDesktopInput(config: DesktopInputConfig): {
  cleanup: () => void
  isWheelActive: () => boolean
} {
  const { canvas, pixiApp, camera, worldContainer, layers, entranceRef } = config
  const cameraRef = { current: camera }

  // ── 휠 줌 핸들러 ──
  const wheelResult = createWheelHandler(cameraRef, entranceRef)
  const cleanupWheel = wheelResult.cleanup

  // ── 드래그 (팬) 핸들러 ──
  let isDragging = false
  let dragDistance = 0
  let lastPos = { x: 0, y: 0 }

  const onPointerDown = (e: PIXI.FederatedPointerEvent) => {
    if (
      e.nativeEvent &&
      (e.nativeEvent.target as Element).tagName !== "CANVAS"
    )
      return
    isDragging = true
    dragDistance = 0
    lastPos = { x: e.global.x, y: e.global.y }
    if (entranceRef.current) {
      clearTimeout(entranceRef.current)
      entranceRef.current = null
    }
  }

  const onPointerMove = (e: PIXI.FederatedPointerEvent) => {
    if (
      e.nativeEvent &&
      (e.nativeEvent.target as Element).tagName !== "CANVAS"
    )
      return
    if (!isDragging) return
    const dx = e.global.x - lastPos.x
    const dy = e.global.y - lastPos.y
    dragDistance += Math.hypot(dx, dy)
    camera.panBy(dx, dy)
    lastPos = { x: e.global.x, y: e.global.y }
  }

  const onPointerUp = () => {
    isDragging = false
  }

  // ── 탭 / 더블탭 핸들러 ──
  let lastTapTime = 0

  const onPointerTap = (e: PIXI.FederatedPointerEvent) => {
    if (
      e.nativeEvent &&
      (e.nativeEvent.target as Element).tagName !== "CANVAS"
    )
      return
    if (dragDistance > 10) return
    if (entranceRef.current) {
      clearTimeout(entranceRef.current)
      entranceRef.current = null
    }
    const now = Date.now()
    if (now - lastTapTime < 350) {
      const worldPos = worldContainer.toLocal(e.global)
      camera.moveTo(worldPos.x, worldPos.y, 0.4)
      lastTapTime = 0
      return
    }
    lastTapTime = now
    if (e.target === pixiApp.stage || e.target === layers.background) {
      const store = useGalaxyStore.getState()
      store.setHighlightedBondPixelId(null)
      if (store.viewMode === 'thoughtGraph') {
        store.selectThought(null)
      }
    }
  }

  // ── 이벤트 바인딩 ──
  pixiApp.stage.on("pointerdown", onPointerDown)
  pixiApp.stage.on("pointermove", onPointerMove)
  pixiApp.stage.on("pointerup", onPointerUp)
  pixiApp.stage.on("pointerupoutside", onPointerUp)
  pixiApp.stage.on("pointertap", onPointerTap)

  canvas.addEventListener("wheel", wheelResult.handleWheel, {
    passive: false,
  })

  return {
    isWheelActive: wheelResult.isWheelActive,
    cleanup: () => {
      pixiApp.stage.off("pointerdown", onPointerDown)
      pixiApp.stage.off("pointermove", onPointerMove)
      pixiApp.stage.off("pointerup", onPointerUp)
      pixiApp.stage.off("pointerupoutside", onPointerUp)
      pixiApp.stage.off("pointertap", onPointerTap)
      canvas.removeEventListener("wheel", wheelResult.handleWheel)
      cleanupWheel()
    },
  }
}
