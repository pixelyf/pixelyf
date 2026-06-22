/**
 * tickerLoop — 메인 Ticker 렌더 루프
 *
 * [Phase 3 Step 4] PixiApplication.tsx에서 추출
 * - 60fps 뷰포트 변화 감지 + Zustand 동기화
 * - updateVisibility 공간 쿼리 (화면 정지 시 스킵)
 * - SpritePool/Swimmer/별/성운/별자리/생각그래프 틱 업데이트
 * - 은하 전환 데드존 판정
 * - 프로파일링 카운터
 */
import type * as PIXI from 'pixi.js'
import type { GalaxyCamera } from '@/shared/lib/pixi/camera'
import type { SpritePool } from '@/shared/lib/pixi/culling'
import { updateVisibility } from '@/shared/lib/pixi/culling'
import type { SpatialGrid } from '@/shared/lib/pixi/spatialGrid'
import { getLODLevel } from '@/shared/lib/pixi/lod'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { getGalaxyFromCoords, GALAXY_CENTERS } from '@/shared/lib/pixi/coordinate'
import { useGalaxyStore, type PixelData, DEFAULT_MOOD_ID } from '@/stores/galaxyStore'
import type { NebulaEffect } from '@/shared/lib/pixi/NebulaEffect'
import type { ThoughtGraphRenderer } from '@/shared/lib/thought-graph/ThoughtGraphRenderer'
import type { StarData } from './initRenderer'

interface TickerLoopConfig {
  pixiApp: PIXI.Application
  camera: GalaxyCamera
  spritePool: SpritePool
  spatialGrid: SpatialGrid<PixelData>
  canvasSize: { current: { width: number; height: number } }
  swimmers: any[]
  starLayer: PIXI.Container | null
  starSprites: PIXI.Sprite[]
  nebulaFx: NebulaEffect | null
  constellationRenderer: { update: (dt: number, zoom: number) => void }
  thoughtRendererRef: { current: ThoughtGraphRenderer | null }
  dataSync: { debouncedFetch: () => void }
  worldOffsetX: number
  worldOffsetY: number
  initialExternalData?: PixelData[]
  isWheelActive: () => boolean
  forceUpdateRef: { current: boolean }
  setVisiblePixels: (count: number) => void
}

export function initTickerLoop(config: TickerLoopConfig): { cleanup: () => void } {
  const {
    pixiApp,
    camera,
    spritePool,
    spatialGrid,
    canvasSize,
    swimmers,
    starLayer,
    starSprites,
    nebulaFx,
    constellationRenderer,
    thoughtRendererRef,
    dataSync,
    worldOffsetX,
    worldOffsetY,
    initialExternalData,
    isWheelActive,
    forceUpdateRef,
    setVisiblePixels,
  } = config

  // ── 정지 화면 공간 쿼리 및 Ticker 최적화를 위한 앵커 변수 ──
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const isUrlEntry = !!(searchParams?.has('feed') || searchParams?.has('pixel'))
  let prevViewport = { x: 0, y: 0, zoom: 0 }
  let prevFilterMoodId = DEFAULT_MOOD_ID
  let lastVisCount = 0

  // ── TICKER (렌더 루프) — 프로파일링 포함 ──
  let _frameCount = 0
  let _perfAccum = {
    bg: 0,
    store: 0,
    vis: 0,
    pool: 0,
    avatar: 0,
    swim: 0,
    star: 0,
    cam: 0,
    total: 0,
  }

  const tickCallback = () => {
    const t0 = performance.now()
    const sw = canvasSize.current.width,
      sh = canvasSize.current.height
    // [OPTIMIZATION] 매 프레임 Graphics 배경 지우기/채우기 제거 -> WebGL 자체 clear 기능(clearBeforeRender: true)으로 드로우콜 1개 완전 절약
    // layers.background.clear().rect(0, 0, sw, sh).fill(0x020617)
    const t1 = performance.now()

    const vp = camera.viewport
    const currentLod = getLODLevel(vp.zoom)
    const store = useGalaxyStore.getState()
    const isGraphMode = store.viewMode === 'thoughtGraph'

    const POS_EPS = 0.5,
      ZOOM_EPS = 0.001
    const isViewportChanged =
      Math.abs(prevViewport.x - vp.x) > POS_EPS ||
      Math.abs(prevViewport.y - vp.y) > POS_EPS ||
      Math.abs(prevViewport.zoom - vp.zoom) > ZOOM_EPS
    const isFilterChanged = prevFilterMoodId !== store.selectedFilterMoodId

    if (isViewportChanged || isFilterChanged || forceUpdateRef.current) {
      prevViewport = { x: vp.x, y: vp.y, zoom: vp.zoom }
      prevFilterMoodId = store.selectedFilterMoodId || DEFAULT_MOOD_ID

      if (!store.isGalaxyWarping) {
        if (!(isUrlEntry && !store.isPixiReady)) {
          store.setViewport(vp)
        }
        if (store.lodLevel !== currentLod) store.setLOD(currentLod)
        
        // 줌 조작 중(줌아웃)이 아닐 때만 은하 전환 판정 가동 (깜빡임 버그 차단)
        const isZooming = isWheelActive()
        if (!isZooming && !store.selectedPixelId) {
          const nextDomain = getGalaxyFromCoords(
            vp.x,
            vp.y,
            worldOffsetX,
            worldOffsetY,
          )
          
          if (store.galaxyKey !== nextDomain) {
            // 넉넉한 유예 버퍼(Deadzone) 주입: 은하 간 전환 핑퐁 방지
            const centers = GALAXY_CENTERS
            const dbX = (vp.x + worldOffsetX) / VISUAL_SCALE
            const dbY = (vp.y + worldOffsetY) / VISUAL_SCALE
            
            const currCenter = centers[store.galaxyKey]
            const nextCenter = centers[nextDomain]
            
            if (currCenter && nextCenter) {
              const distToCurr = Math.hypot(dbX - currCenter.x, dbY - currCenter.y)
              const distToNext = Math.hypot(dbX - nextCenter.x, dbY - nextCenter.y)
              
              // 전환 데드존 마진: 새로운 은하가 기존 은하보다 확실히 400 스케일 이상 가까워졌을 때만 전환 실행
              if (distToCurr - distToNext > 400) {
                store.setGalaxyKey(nextDomain)
                store.setGalaxyDomain(nextDomain)
              }
            } else {
              store.setGalaxyKey(nextDomain)
              store.setGalaxyDomain(nextDomain)
            }
          }
        }
        if (!initialExternalData?.length && isViewportChanged) dataSync.debouncedFetch()
      }
    }
    const t2 = performance.now()

    const dt = pixiApp.ticker.deltaMS / 1000

    // [OPTIMIZATION] 화면 정지 시 updateVisibility 공간 쿼리 스킵하여 CPU 부하 0% 수렴
    let visCount = lastVisCount
    if (!isGraphMode && (isViewportChanged || isFilterChanged || forceUpdateRef.current)) {
      forceUpdateRef.current = false
      visCount = updateVisibility(
        spatialGrid,
        spritePool,
        camera,
        currentLod,
        store.selectedFilterMoodId,
        sw,
        sh,
      )
      lastVisCount = visCount
      setVisiblePixels(visCount)
    } else if (isGraphMode && forceUpdateRef.current) {
      forceUpdateRef.current = false
      setVisiblePixels(0)
    }
    const t3 = performance.now()

    spritePool.update(dt, vp.zoom)
    const t4 = performance.now()

    const t5 = performance.now()

    if (!isGraphMode) {
      swimmers.forEach((s) => {
        if (!s.destroyed) s.update(dt, vp.zoom, vp.x, vp.y)
      })
      constellationRenderer.update(dt, vp.zoom)
    } else {
      // [지시 반영] 물리 시뮬레이션 종료 여부와 무관하게 60fps 무중력 부유 틱 영구 가동
      if (thoughtRendererRef.current) {
        thoughtRendererRef.current.updateBreathingAndFloating(vp.zoom)
      }
    }
    const t6 = performance.now()

    // 성운 애니메이션 (stage 직접 자식 + 이동/줌 패럴랙스 + 래핑)
    if (nebulaFx) {
      const time = Date.now() / 1000
      nebulaFx.update(time, vp.x, vp.y, vp.zoom, sw, sh)
    }

    // 별 패러랙스
    if (starLayer) {
      const time = Date.now() / 1000
      const w = Math.max(sw, 3000),
        h = Math.max(sh, 3000)
      starSprites.forEach((s, i) => {
        const sd = (s as any).starData as StarData
        let px = (sd.x * w - vp.x * sd.z) % w
        let py = (sd.y * h - vp.y * sd.z) % h
        if (px < 0) px += w
        if (py < 0) py += h
        s.position.set(px, py)
        s.scale.set((sd.size * Math.pow(vp.zoom / 0.1, sd.z * 7.5)) / 10)
        // [OPTIMIZATION] 매 프레임 Math.random() 호출을 Sin 맥동식으로 대체하여 GC 병목 및 연산 부하 완벽 소거
        s.alpha = Math.max(
          0.2,
          sd.z > 0.025
            ? 0.3 + 0.7 * Math.sin(time * 1.5 + i)
            : 0.5 + 0.5 * Math.sin(time * 3.0 + i),
        )
      })
    }
    const t7 = performance.now()

    camera.applyTransform()
    const t8 = performance.now()

    // ── PERF LOG (60프레임마다 = ~1초) ──
    _perfAccum.bg += t1 - t0
    _perfAccum.store += t2 - t1
    _perfAccum.vis += t3 - t2
    _perfAccum.pool += t4 - t3
    _perfAccum.avatar += t5 - t4
    _perfAccum.swim += t6 - t5
    _perfAccum.star += t7 - t6
    _perfAccum.cam += t8 - t7
    _perfAccum.total += t8 - t0
    _frameCount++
    if (_frameCount >= 60) {
      // const avg = (v: number) => (v / _frameCount).toFixed(2)
      // console.log(
      //   `[PERF-FRAME] avg/frame: ${avg(_perfAccum.total)}ms | ` +
      //   `bg:${avg(_perfAccum.bg)} store:${avg(_perfAccum.store)} ` +
      //   `vis:${avg(_perfAccum.vis)} pool:${avg(_perfAccum.pool)} ` +
      //   `avatar:${avg(_perfAccum.avatar)} swim:${avg(_perfAccum.swim)} ` +
      //   `star:${avg(_perfAccum.star)} cam:${avg(_perfAccum.cam)} ` +
      //   `LOD:${currentLod} visible:${visCount}`
      // )
      _frameCount = 0
      _perfAccum = {
        bg: 0,
        store: 0,
        vis: 0,
        pool: 0,
        avatar: 0,
        swim: 0,
        star: 0,
        cam: 0,
        total: 0,
      }
    }
  }

  pixiApp.ticker.add(tickCallback)

  return {
    cleanup: () => {
      pixiApp.ticker.remove(tickCallback)
    },
  }
}
