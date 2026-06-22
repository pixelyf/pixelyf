/**
 * [Mobile Gesture Handler]
 * 모바일 캔버스의 핀치 줌, 1-finger 팬, nearest-pixel 선택을 처리합니다.
 * 데스크탑의 wheel + pointer 핸들러를 대체합니다.
 *
 * 기술 설계:
 *   - 1-finger: 팬(드래그)
 *   - 2-finger: 핀치 줌 (팬 중단 → 줌 모드 진입)
 *   - 더블탭: 해당 좌표로 줌 인 (camera.moveTo + zoomTo)
 *   - 픽셀 탭: SpatialGrid nearest-pixel 조회 → 44px 미달 hitArea 보완
 */
import type { GalaxyCamera } from '@/shared/lib/pixi/camera'
import type { SpatialGrid } from '@/shared/lib/pixi/spatialGrid'
import { useGalaxyStore, type PixelData } from '@/stores/galaxyStore'

interface MobileGestureConfig {
  camera: GalaxyCamera
  spatialGrid: SpatialGrid<PixelData>
  entranceRef: { current: ReturnType<typeof setTimeout> | null }
  worldContainer: import('pixi.js').Container
}

// ── 유틸: 두 터치 포인트 간 거리 ──
function getTouchDistance(t1: Touch, t2: Touch): number {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.hypot(dx, dy)
}

// ── 유틸: 두 터치 포인트의 중심 ──
function getTouchCenter(t1: Touch, t2: Touch): { x: number; y: number } {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  }
}

export function initMobileGestures(
  canvas: HTMLCanvasElement,
  config: MobileGestureConfig
) {
  const { camera, spatialGrid, entranceRef, worldContainer } = config

  // ── 상태 변수 ──
  let isPanning = false
  let isPinching = false
  let lastPanPos = { x: 0, y: 0 }
  let panStartPos = { x: 0, y: 0 }
  let panDistance = 0
  let touchVelocity = { x: 0, y: 0 }
  let lastTouchTime = 0

  // 핀치 줌 상태
  let initialPinchDist = 0
  let initialPinchZoom = 0

  // 더블탭 감지
  let lastTapTime = 0
  let lastTapPos = { x: 0, y: 0 }
  const DOUBLE_TAP_THRESHOLD = 300 // ms
  const DOUBLE_TAP_RADIUS = 30 // px — 같은 위치로 판단하는 반경

  // 탭 vs 드래그 구분
  const TAP_DISTANCE_THRESHOLD = 10 // px 이상 이동하면 드래그

  // ── touchstart ──
  const handleTouchStart = (e: TouchEvent) => {
    // 자동 진입 연출 취소
    if (entranceRef.current) {
      clearTimeout(entranceRef.current)
      entranceRef.current = null
    }

    if (e.touches.length === 2) {
      // ── 2-finger: 핀치 줌 모드 진입 ──
      isPanning = false
      isPinching = true
      initialPinchDist = getTouchDistance(e.touches[0], e.touches[1])
      initialPinchZoom = camera.viewport.zoom
      e.preventDefault() // 브라우저 기본 핀치줌 차단
    } else if (e.touches.length === 1) {
      // ── 1-finger: 팬 준비 ──
      isPanning = true
      isPinching = false
      panDistance = 0
      const touch = e.touches[0]
      lastPanPos = { x: touch.clientX, y: touch.clientY }
      panStartPos = { x: touch.clientX, y: touch.clientY }
      touchVelocity = { x: 0, y: 0 }
      lastTouchTime = Date.now()
    }
  }

  // ── touchmove ──
  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && isPinching) {
      // ── 핀치 줌 처리 ──
      e.preventDefault()
      const dist = getTouchDistance(e.touches[0], e.touches[1])
      const scale = dist / initialPinchDist
      // [TECH DEBT Phase 1] camera.zoomTo() 내부에서 _zoomMin/_zoomMax 클램핑이 적용되므로
      // 호출측에서 줌 범위를 중복 클램핑하지 않습니다.
      const newZoom = initialPinchZoom * scale
      camera.zoomTo(newZoom, 0.08) // 매우 짧은 duration으로 부드러운 핀치 추종
    } else if (e.touches.length === 1 && isPanning && !isPinching) {
      // ── 1-finger 팬 ──
      const touch = e.touches[0]
      const now = Date.now()
      const dt = Math.max(1, now - lastTouchTime)
      const dx = touch.clientX - lastPanPos.x
      const dy = touch.clientY - lastPanPos.y
      panDistance += Math.hypot(dx, dy)
      camera.panBy(dx, dy)
      
      touchVelocity.x = touchVelocity.x * 0.4 + (dx / dt) * 0.6
      touchVelocity.y = touchVelocity.y * 0.4 + (dy / dt) * 0.6
      
      lastPanPos = { x: touch.clientX, y: touch.clientY }
      lastTouchTime = now
    }
  }

  // ── touchend ──
  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      // 모든 손가락 뗌
      if (isPanning && panDistance >= TAP_DISTANCE_THRESHOLD) {
        // 드래그가 끝났으므로 관성 적용
        camera.applyInertia(touchVelocity.x, touchVelocity.y)
      } else if (isPanning && panDistance < TAP_DISTANCE_THRESHOLD) {
        // ── 탭 감지 (드래그 아님) ──
        const now = Date.now()
        const tapPos = { x: panStartPos.x, y: panStartPos.y }

        if (
          now - lastTapTime < DOUBLE_TAP_THRESHOLD &&
          Math.hypot(tapPos.x - lastTapPos.x, tapPos.y - lastTapPos.y) < DOUBLE_TAP_RADIUS
        ) {
          // ── 더블탭: 해당 좌표로 줌 인 ──
          handleDoubleTap(tapPos)
          lastTapTime = 0
        } else {
          // ── 싱글탭: 픽셀 선택 시도 ──
          lastTapTime = now
          lastTapPos = tapPos

          // 300ms 후 싱글탭 확정 (더블탭 대기)
          setTimeout(() => {
            if (Date.now() - lastTapTime >= DOUBLE_TAP_THRESHOLD - 10) {
              handleSingleTap(tapPos)
            }
          }, DOUBLE_TAP_THRESHOLD)
        }
      }

      isPanning = false
      isPinching = false
    } else if (e.touches.length === 1 && isPinching) {
      // 핀치 → 1-finger 전환: 남은 손가락으로 팬 시작
      isPinching = false
      isPanning = true
      panDistance = TAP_DISTANCE_THRESHOLD + 1 // 이미 이동한 것으로 간주 (탭 방지)
      const touch = e.touches[0]
      lastPanPos = { x: touch.clientX, y: touch.clientY }
      panStartPos = { x: touch.clientX, y: touch.clientY }
      touchVelocity = { x: 0, y: 0 }
      lastTouchTime = Date.now()
    }
  }

  // ── 더블탭 핸들러: 줌 인/아웃 토글 ──
  function handleDoubleTap(pos: { x: number; y: number }) {
    const vp = camera.viewport
    // 화면 좌표 → 월드 좌표 변환
    const worldX = vp.x + (pos.x - window.innerWidth / 2) / vp.zoom
    const worldY = vp.y + (pos.y - window.innerHeight / 2) / vp.zoom

    if (vp.zoom < 0.3) {
      // 줌 아웃 상태 → 줌 인
      camera.moveTo(worldX, worldY, 0.4)
      camera.zoomTo(0.5, 0.4)
    } else if (vp.zoom < 1.5) {
      // 중간 줌 → 더 줌 인
      camera.moveTo(worldX, worldY, 0.4)
      camera.zoomTo(1.5, 0.4)
    } else {
      // 줌 인 상태 → 줌 아웃 (원래대로)
      camera.zoomTo(0.1, 0.4)
    }
  }

  // ── 싱글탭 핸들러: nearest-pixel 프리뷰 (2-Step 패턴) ──
  // 모바일에서는 탭 시 즉시 판넬을 열지 않고, PixelTooltip 프리뷰를 표시합니다.
  // "자세히 보기" 버튼 클릭 시 비로소 PixelDetailDrawer가 열립니다.
  function handleSingleTap(pos: { x: number; y: number }) {
    const vp = camera.viewport
    // 화면 좌표 → 월드 좌표 변환
    const worldX = vp.x + (pos.x - window.innerWidth / 2) / vp.zoom
    const worldY = vp.y + (pos.y - window.innerHeight / 2) / vp.zoom

    // ── nearest-pixel 로직 ──
    // Apple HIG 최소 터치 타겟 기준 25px 화면 반경 → 월드 좌표 반경
    const touchRadiusWorld = 25 / vp.zoom 
    const candidates = spatialGrid.query(
      worldX - touchRadiusWorld,
      worldX + touchRadiusWorld,
      worldY - touchRadiusWorld,
      worldY + touchRadiusWorld,
    )

    if (candidates.length === 0) {
      // 빈 영역 탭: 프리뷰 말풍선 dismiss + 선택 해제
      window.dispatchEvent(new CustomEvent('pixel-hover', { detail: null }))
      const store = useGalaxyStore.getState()
      store.selectPixel(null)
      store.setHighlightedBondPixelId(null)
      if (store.viewMode === 'thoughtGraph') {
        store.selectThought(null)
      }
      return
    }

    // 가장 가까운 픽셀 선택 (반경 내에 있는 것만)
    let nearestPixel = null
    let nearestDist = touchRadiusWorld

    for (const pixel of candidates) {
      const dist = Math.hypot(pixel.coordX - worldX, pixel.coordY - worldY)
      if (dist <= nearestDist) {
        nearestDist = dist
        nearestPixel = pixel
      }
    }

    if (!nearestPixel) {
      // 반경 내에 픽셀이 없음: 프리뷰 dismiss + 선택 해제
      window.dispatchEvent(new CustomEvent('pixel-hover', { detail: null }))
      const store = useGalaxyStore.getState()
      store.selectPixel(null)
      store.setHighlightedBondPixelId(null)
      if (store.viewMode === 'thoughtGraph') {
        store.selectThought(null)
      }
      return
    }

    // 캔버스 터치 시 전역 상태에 임시 데이터 보관 (나중에 판넬에서 사용)
    const store = useGalaxyStore.getState()
    store.setPreloadedPixelData({
      pixelId: nearestPixel.pixelId,
      coordX: nearestPixel.coordX,
      coordY: nearestPixel.coordY,
      displayName: nearestPixel.displayName,
      country: nearestPixel.country,
      personaCode: nearestPixel.personaCode,
      supernovaTier: nearestPixel.supernovaTier || undefined,
      momentContent: nearestPixel.momentContent,
      moodId: nearestPixel.moodId,
      pingCount: nearestPixel.pingCount || 0,
      glowColorPrimary: nearestPixel.glowColorPrimary || '#818CF8',
      glowColorSecondary: nearestPixel.glowColorSecondary || '#C084FC',
      rank: nearestPixel.rank,
    })
    // 모바일 터치 시 즉시 해당 픽셀의 연결선을 밝게(FOCUS_ALPHA) 하이라이트
    store.setHighlightedBondPixelId(nearestPixel.pixelId)

    // ── [2-Step] selectPixel 호출하지 않음! ──
    // 대신 pixel-hover 이벤트를 발행하여 PixelTooltip 프리뷰만 표시
    // 스프라이트의 화면 좌표 계산 (탭 위치 근처에 표시)
    const screenX = pos.x
    const screenY = pos.y

    window.dispatchEvent(new CustomEvent('pixel-hover', {
      detail: {
        pixelId: nearestPixel.pixelId,
        screenX,
        screenY,
        scaledRadius: 20, // 모바일에서는 고정값 사용 (손가락 크기 고려)
        displayName: nearestPixel.displayName,
        momentContent: nearestPixel.momentContent,
        momentThumbnail: nearestPixel.momentThumbnail,
        country: nearestPixel.country,
        isMobileTap: true, // 모바일 탭 식별 플래그
        rank: nearestPixel.rank,
      }
    }))

    // 부드러운 카메라 포커스 (프리뷰 단계에서는 줌 인 하지 않음 — 공간감 유지)
    camera.moveTo(nearestPixel.coordX, nearestPixel.coordY, 0.3)
  }

  // ── 이벤트 등록 ──
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
  canvas.addEventListener('touchend', handleTouchEnd, { passive: true })

  // ── Cleanup ──
  const cleanup = () => {
    canvas.removeEventListener('touchstart', handleTouchStart)
    canvas.removeEventListener('touchmove', handleTouchMove)
    canvas.removeEventListener('touchend', handleTouchEnd)
  }

  return { cleanup, isPinching: () => isPinching }
}
