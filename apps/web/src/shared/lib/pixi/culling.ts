/**
 * SpritePool & updateVisibility — 갤럭시 엔진의 객체 풀링 및 가시성 관리
 * 
 * [CLEAN ROOM v2] 2026-05-01
 * 검증된 알고리즘:
 *   1. Lazy Creation: 스프라이트를 사전 생성하지 않고, acquire 시 필요할 때 생성
 *   2. 티커 정지 중 모든 스프라이트를 일괄 생성 → 티커 시작 (Atomic Render)
 *   3. acquire/release 패턴으로 객체 재사용 (GC 최소화)
 *
 * [TECH DEBT Phase 2-B] PixelSprite 구체 클래스 의존성을 IPixelSprite 인터페이스로 추상화.
 * 엔진 레이어(shared/lib/pixi)가 비즈니스 레이어(entities/user/ui)를 직접 참조하지 않습니다.
 */
import * as PIXI from 'pixi.js'
import { PixelData } from '@/stores/galaxyStore'
import { LODLevel, LOD_CONFIG } from './lod'
import { SpatialGrid } from './spatialGrid'
import { GalaxyCamera } from './camera'

/**
 * SpritePool이 요구하는 스프라이트의 최소 인터페이스.
 * 구체 구현체(PixelSprite)는 entities 레이어에서 이 인터페이스를 구현합니다.
 */
export interface IPixelSprite {
  container: PIXI.Container
  currentData: PixelData | null
  updateData(data: PixelData): void
  applyLOD(lodLevel: LODLevel): void
  setHovered(isHovered: boolean): void
  setFiltered(isMatch: boolean, isFiltering: boolean): void
  update(deltaFactor: number, zoom: number): void
  resetAnimations(): void
  playAuraWave(color: string): void
}

/** 스프라이트 팩토리 — SpritePool이 새 스프라이트를 생성할 때 호출합니다. */
export type PixelSpriteFactory = () => IPixelSprite

// ─── SpritePool ───

export class SpritePool {
  private pool: IPixelSprite[] = []
  private activeMap: Map<string, IPixelSprite> = new Map()
  private hiddenMap: Map<string, IPixelSprite> = new Map()  // [PERF v2] 줌 시 메모리 유지 — 풀 반환 대신 숨기기
  private onClick?: (data: PixelData, sprite: IPixelSprite) => void
  private factory: PixelSpriteFactory

  constructor(
    private container: PIXI.Container,
    factory: PixelSpriteFactory,
    onClick?: (data: PixelData, sprite: IPixelSprite) => void,
  ) {
    this.factory = factory
    this.onClick = onClick
    // [LAZY] 사전 생성 없음 — acquire()에서 필요할 때 즉시 생성
  }

  /** 풀용 스프라이트 1개 생성 (이벤트 핸들러 포함) */
  private _createSprite(): IPixelSprite {
    const sprite = this.factory()
    this.container.addChild(sprite.container)

    // 히트 영역 설정 (육각형 코어를 둘러싼 첫 번째 빛 무리까지 확장)
    sprite.container.hitArea = new PIXI.Circle(0, 0, 100)

    // 클릭 및 드래그 충돌 분리 처리
    let dragStartGlobal = { x: 0, y: 0 }
    let clickCanceled = false

    sprite.container.on('pointerdown', (e: any) => {
      if (e.nativeEvent && (e.nativeEvent.target as Element).tagName !== 'CANVAS') return
      dragStartGlobal = { x: e.global.x, y: e.global.y }
      clickCanceled = false
    })

    sprite.container.on('pointerup', (e: any) => {
      if (e.nativeEvent && (e.nativeEvent.target as Element).tagName !== 'CANVAS') return
      if (clickCanceled) return

      const dx = e.global.x - dragStartGlobal.x
      const dy = e.global.y - dragStartGlobal.y
      const dist = Math.hypot(dx, dy)

      // 드래그 거리가 10px 미만인 순수 클릭인 경우에만 상세 판넬 마운트
      if (dist < 10) {
        if (sprite.currentData && this.onClick) {
          this.onClick(sprite.currentData, sprite)
        }
      }
    })

    sprite.container.on('pointerupoutside', () => {
      clickCanceled = true
    })

    // Hover 이벤트 — HTML 말풍선 트리거
    sprite.container.on('pointerover', (e: any) => {
      if (e.nativeEvent && (e.nativeEvent.target as Element).tagName !== 'CANVAS') return
      sprite.setHovered(true)
      if (sprite.currentData) {
        const pos = sprite.container.getGlobalPosition()
        const rightEdge = sprite.container.toGlobal(new PIXI.Point(100, 0))
        const scaledRadius = Math.abs(rightEdge.x - pos.x)

        window.dispatchEvent(new CustomEvent('pixel-hover', {
          detail: {
            pixelId: sprite.currentData.pixelId,
            screenX: pos.x,
            screenY: pos.y,
            scaledRadius: scaledRadius,
            displayName: sprite.currentData.displayName,
            momentContent: sprite.currentData.momentContent,
            momentThumbnail: sprite.currentData.momentThumbnail,
            country: sprite.currentData.country,
            rank: sprite.currentData.rank,
          }
        }))
      }
    })

    sprite.container.on('pointerout', () => {
      sprite.setHovered(false)
      window.dispatchEvent(new CustomEvent('pixel-hover', { detail: null }))
    })

    return sprite
  }

  /** 이미 활성화된 스프라이트인지 O(1) 확인 */
  hasActive(pixelId: string): boolean {
    return this.activeMap.has(pixelId)
  }

  /** 데이터에 해당하는 스프라이트를 풀에서 가져오거나 기존 할당된 것을 반환 */
  acquire(data: PixelData): IPixelSprite | null {
    // 이미 활성화된 스프라이트가 있으면 재사용
    if (this.activeMap.has(data.pixelId)) {
      return this.activeMap.get(data.pixelId)!
    }

    // [PERF v2] 숨겨진 스프라이트 즉시 복구 (0ms, updateData 불필요)
    if (this.hiddenMap.has(data.pixelId)) {
      const sprite = this.hiddenMap.get(data.pixelId)!
      this.hiddenMap.delete(data.pixelId)
      sprite.container.visible = true
      sprite.container.renderable = true
      this.activeMap.set(data.pixelId, sprite)
      return sprite
    }

    // 풀에서 하나 꺼냄 — 비어있으면 즉시 생성 (Lazy Creation)
    let sprite = this.pool.pop()
    if (!sprite) {
      sprite = this._createSprite()
    }

    sprite.updateData(data)
    this.activeMap.set(data.pixelId, sprite)
    return sprite
  }

  /**
   * [PERF v2] 가시 영역 밖 스프라이트를 숨김 (메모리 유지, 풀 반환 X)
   * - resetAnimations() 호출 안 함 → GSAP killTweensOf 대량 생성/소멸 제거
   * - pool.push() 안 함 → 풀 반환/재할당 사이클 제거
   * - hiddenMap에 보관 → 줌 인 시 0ms 즉시 복구
   */
  hideExcept(visibleIds: Set<string>) {
    for (const [id, sprite] of this.activeMap) {
      if (!visibleIds.has(id)) {
        sprite.container.visible = false
        sprite.container.renderable = false
        this.hiddenMap.set(id, sprite)
        this.activeMap.delete(id)
      }
    }
  }

  /** 모든 활성+숨김 스프라이트를 풀로 반환 (은하 전환 시) */
  releaseAll(): void {
    for (const [, sprite] of this.activeMap) {
      sprite.resetAnimations()
      sprite.container.visible = false
      sprite.container.renderable = false
      this.pool.push(sprite)
    }
    this.activeMap.clear()

    // [PERF v2] 숨김 상태 스프라이트도 모두 풀로 반환 (은하 전환 잔류 방지)
    for (const [, sprite] of this.hiddenMap) {
      sprite.resetAnimations()
      sprite.container.visible = false
      sprite.container.renderable = false
      this.pool.push(sprite)
    }
    this.hiddenMap.clear()
  }

  /** 특정 픽셀의 활성 스프라이트 조회 */
  getActiveSprite(pixelId: string): IPixelSprite | undefined {
    return this.activeMap.get(pixelId)
  }

  /** 활성 스프라이트 개수 */
  getActiveCount(): number {
    return this.activeMap.size
  }

  /** [PERF v2] 메모리에 유지 중인 전체 스프라이트 수 (활성 + 숨김) */
  getTotalManagedCount(): number {
    return this.activeMap.size + this.hiddenMap.size
  }

  /** [PERF v2] hiddenMap 키 목록 반환 (evictOutside 동기화용) */
  getHiddenIds(): IterableIterator<string> {
    return this.hiddenMap.keys()
  }

  /**
   * [PERF v2] SpatialGrid.evictOutside() 또는 remove()로 데이터가 삭제된 픽셀을
   * hiddenMap에서도 정리합니다. 데이터-스프라이트 일관성 보장.
   */
  removeFromHidden(pixelId: string): void {
    const sprite = this.hiddenMap.get(pixelId)
    if (sprite) {
      sprite.resetAnimations()
      sprite.container.visible = false
      sprite.container.renderable = false
      this.pool.push(sprite)
      this.hiddenMap.delete(pixelId)
    }
  }

  /** Ticker에서 호출: 활성 스프라이트들의 애니메이션 업데이트 */
  // [PERF v2] hiddenMap은 순회하지 않음 — 숨긴 스프라이트는 애니메이션 불필요
  update(deltaFactor: number, zoom: number) {
    this.activeMap.forEach(sprite => sprite.update(deltaFactor, zoom))
  }

  /** 엔진 종료 시 모든 스프라이트 정리 */
  destroy(): void {
    this.releaseAll()
    this.pool.length = 0
  }
}

// ─── updateVisibility: 매 프레임 가시성 관리 ───

export function updateVisibility(
  grid: SpatialGrid<PixelData>,
  pool: SpritePool,
  camera: GalaxyCamera,
  lodLevel: LODLevel,
  selectedFilterMoodId: string | null,
  canvasWidth?: number,
  canvasHeight?: number,
): number {
  const { x, y, zoom } = camera.viewport
  const config = LOD_CONFIG[lodLevel]
  
  const camX = x
  const camY = y

  const cw = canvasWidth ?? window.innerWidth
  const ch = canvasHeight ?? window.innerHeight

  const halfW = (cw / 2) / zoom
  const halfH = (ch / 2) / zoom

  // 렌더 버퍼: 화면 밖 pad 영역까지 쿼리하여 패닝 시 팝인(Pop-in) 방지
  const pad = config.renderRadiusPx / zoom
  const queryMinX = camX - halfW - pad
  const queryMaxX = camX + halfW + pad
  const queryMinY = camY - halfH - pad
  const queryMaxY = camY + halfH + pad

  // O(1) Spatial Query (Buffer 포함)
  const allVisiblePixels = grid.query(queryMinX, queryMaxX, queryMinY, queryMaxY)
  
  const visibleIds = new Set<string>()
  let strictVisibleCount = 0

  // 뷰포트 실제 영역 바운더리 캐싱 (나눗셈 방지)
  const boundaryMinX = camX - halfW
  const boundaryMaxX = camX + halfW
  const boundaryMinY = camY - halfH
  const boundaryMaxY = camY + halfH

  for (const data of allVisiblePixels) {
    // 실제 화면 테두리 안에 있는 것만 HUD 카운트 (WYSIWYG)
    if (data.coordX >= boundaryMinX && data.coordX <= boundaryMaxX &&
        data.coordY >= boundaryMinY && data.coordY <= boundaryMaxY) {
      strictVisibleCount++
    }

    visibleIds.add(data.pixelId)

    const sprite = pool.acquire(data)
    
    if (sprite) {
      sprite.applyLOD(lodLevel)
      
      const isFiltering = !!selectedFilterMoodId
      const isMatch = data.moodId === selectedFilterMoodId
      sprite.setFiltered(isMatch, isFiltering)
    }
  }

  // [PERF v2] 화면 밖 스프라이트를 숨김 (메모리 유지, 줌 인 시 즉시 복구)
  pool.hideExcept(visibleIds)

  return strictVisibleCount
}
