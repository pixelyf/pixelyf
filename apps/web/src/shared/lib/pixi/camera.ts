import * as PIXI from 'pixi.js'
import { gsap } from 'gsap'

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** 줌 범위 기본 상수 */
const ZOOM_MIN = 0.031
const ZOOM_MAX = 6.3

export class GalaxyCamera {
  private stage: PIXI.Container
  private _viewport: Viewport = { x: 0, y: 0, zoom: 1.0 }
  private _activeWarpTaskId = 0
  private _canvasWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1000
  private _canvasHeight: number = typeof window !== 'undefined' ? window.innerHeight : 800
  private _zoomMin = ZOOM_MIN
  private _zoomMax = ZOOM_MAX

  constructor(stage: PIXI.Container) {
    this.stage = stage
  }

  /** 캔버스 컨테이너의 크기를 반영합니다. ResizeObserver에서 호출됩니다. */
  setCanvasSize(width: number, height: number): void {
    this._canvasWidth = width
    this._canvasHeight = height
  }

  get canvasWidth(): number { return this._canvasWidth }
  get canvasHeight(): number { return this._canvasHeight }

  get viewport(): Viewport {
    return { ...this._viewport }
  }

  isTweening(): boolean {
    return gsap.isTweening(this._viewport)
  }

  private _interruptWarp(): void {
    this._activeWarpTaskId++
    gsap.killTweensOf(this._viewport)
  }

  /**
   * [FIX] moveTo/zoomTo가 서로의 트윈을 파괴하지 않도록 프로퍼티별 개별 kill
   * gsap.killTweensOf(target, "props")는 해당 프로퍼티의 트윈만 제거합니다.
   */
  private _killPositionTweens(): void {
    gsap.killTweensOf(this._viewport, "x,y")
  }

  private _killZoomTweens(): void {
    gsap.killTweensOf(this._viewport, "zoom")
  }

  moveTo(x: number, y: number, duration: number = 0.5): void {
    if (duration === 0) {
      this.warpTo(x, y)
      return
    }

    // [FIX] 위치 트윈만 제거 — zoom 트윈은 보존
    this._killPositionTweens()
    gsap.to(this._viewport, {
      x,
      y,
      duration,
      ease: 'power2.out',
      onUpdate: () => { },
    })
  }

  /**
   * 은하 간 초장거리 이동 시 사용되는 즉각적인 워프(Warp)
   * 진행 중인 애니메이션을 강제 취소하고 해당 좌표로 즉시 순간 이동합니다.
   */
  warpTo(x: number, y: number): void {
    this._interruptWarp()
    this._viewport.x = x
    this._viewport.y = y
    this.applyTransform()
  }
  /** Instantly pan by screen-space pixel deltas without GSAP */
  panBy(dx: number, dy: number): void {
    this._interruptWarp()
    this._killPositionTweens()
    this._viewport.x -= dx / this._viewport.zoom
    this._viewport.y -= dy / this._viewport.zoom
    this.applyTransform()
  }

  /** Apply smooth deceleration slide on drag release based on velocity (screen px/ms) */
  applyInertia(vx: number, vy: number): void {
    this._interruptWarp()

    const speed = Math.hypot(vx, vy)
    if (speed < 0.1) return // 속도가 임계값 미만이면 무시

    // 관성 감쇠 튜닝 상수
    const driftFactor = 150
    const duration = Math.min(0.8, 0.4 + speed * 0.3) // 속도에 비례하는 감속 시간

    const worldVx = vx / this._viewport.zoom
    const worldVy = vy / this._viewport.zoom

    const targetX = this._viewport.x - worldVx * driftFactor
    const targetY = this._viewport.y - worldVy * driftFactor

    this._killPositionTweens()
    gsap.to(this._viewport, {
      x: targetX,
      y: targetY,
      duration,
      ease: 'power2.out',
      onUpdate: () => this.applyTransform()
    })
  }

  /**
   * 줌 범위를 외부에서 동적으로 변경합니다.
   * viewMode 전환(pixelyer ↔ thoughtGraph) 시 호출측에서 setZoomRange를 호출하여
   * 카메라 모듈의 Store 의존성을 완전히 제거합니다.
   */
  setZoomRange(min: number, max: number): void {
    this._zoomMin = min
    this._zoomMax = max
  }

  zoomTo(zoom: number, duration = 0.5): void {
    const target = Math.max(this._zoomMin, Math.min(this._zoomMax, zoom));
    
    if (duration === 0) {
      this._interruptWarp()
      this._killZoomTweens()
      this._viewport.zoom = target
      this.applyTransform()
      return
    }

    // [FIX] zoom 트윈만 제거 — 위치(x,y) 트윈은 보존
    this._killZoomTweens()
    gsap.to(this._viewport, {
      zoom: target,
      duration,
      ease: 'expo.out',
      onUpdate: () => this.applyTransform(),
    })
  }

  /**
   * Cinematic warp transit between distant galaxies or nebula clusters.
   */
  async deepWarp(x: number, y: number, targetZoom: number = 0.1): Promise<void> {
    const taskId = ++this._activeWarpTaskId
    console.log('[DEBUG_CAM] deepWarp START. TaskId:', taskId);
    gsap.killTweensOf(this._viewport)

    // 1. Initial FOV Expand (Zoom out)
    await gsap.to(this._viewport, {
      zoom: 0.04,
      duration: 0.6,
      ease: 'power2.in',
      onUpdate: () => { }
    })
    if (this._activeWarpTaskId !== taskId) {
      console.log('[DEBUG_CAM] deepWarp ABORTED after Phase 1. Current:', this._activeWarpTaskId);
      return
    }

    // 2. High-speed warp pan
    await gsap.to(this._viewport, {
      x,
      y,
      duration: 1.2,
      ease: 'expo.inOut',
      onUpdate: () => { }
    })
    if (this._activeWarpTaskId !== taskId) {
      console.log('[DEBUG_CAM] deepWarp ABORTED after Phase 2. Current:', this._activeWarpTaskId);
      return
    }

    // 3. Arrival zoom-in
    await gsap.to(this._viewport, {
      zoom: targetZoom,
      duration: 0.8,
      ease: 'power3.out',
      onUpdate: () => { }
    })
    if (this._activeWarpTaskId !== taskId) {
      console.log('[DEBUG_CAM] deepWarp ABORTED after Phase 3. Current:', this._activeWarpTaskId);
      return
    }

    // 4. Subtle Cinematic Arrival Shake
    if (this.stage && !(this.stage as any).destroyed) {
      const originalX = this.stage.x;
      const originalY = this.stage.y;

      gsap.to(this.stage, {
        x: originalX + 15,
        y: originalY - 15,
        yoyo: true,
        repeat: 3,
        duration: 0.06,
        ease: 'sine.inOut',
        onComplete: () => {
          this.applyTransform() // Ensure exact viewport sync is restored
        }
      })
    }
  }

  async focusOnPixel(coordX: number, coordY: number): Promise<void> {
    gsap.killTweensOf(this._viewport)

    await gsap.to(this._viewport, {
      x: coordX,
      y: coordY,
      zoom: 1.5,
      duration: 2.0,
      ease: 'power3.out',
      onUpdate: () => { },
    })
  }

  destroy(): void {
    gsap.killTweensOf(this._viewport)
    // @ts-ignore
    this.stage = null
  }

  private _uiRightOffset: number = 0

  setUiRightOffset(offset: number): void {
    this._uiRightOffset = offset
  }

  applyTransform(): void {
    if (!this.stage || (this.stage as any).destroyed) return

    // viewport.x/y가 화면 중앙이 바라보는 월드 좌표가 되도록 변환
    // [LAYOUT v3] 패널이 차지하는 너비(uiRightOffset)를 제외한 컨텐츠 영역의 중앙을 새로운 기준으로 삼음
    const centerX = (this._canvasWidth - this._uiRightOffset) / 2
    const centerY = this._canvasHeight / 2

    this.stage.x = centerX - this._viewport.x * this._viewport.zoom
    this.stage.y = centerY - this._viewport.y * this._viewport.zoom
    this.stage.scale.set(this._viewport.zoom)
  }
}
