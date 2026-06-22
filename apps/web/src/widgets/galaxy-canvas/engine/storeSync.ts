/**
 * [스토어 동기화 모듈]
 * Zustand 스토어 ↔ 엔진 양방향 동기화를 담당합니다.
 * [ARCHITECTURE REFACTOR] Zustand pixels 제거, SpatialGrid 직접 참조를 통해 O(1) 수정 및 메모리 무할당 구현.
 */
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { useGalaxyStore, type PixelData, DEFAULT_MOOD_ID } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { GalaxyCamera } from '@/shared/lib/pixi/camera'
import { SpritePool } from '@/shared/lib/pixi/culling'
import { PixelySwimmer } from '@/shared/lib/pixi/PixelySwimmer'
import { getGalaxyFromCoords } from '@/shared/lib/pixi/coordinate'
import { SpatialGrid } from '@/shared/lib/pixi/spatialGrid'
import { shallow } from 'zustand/shallow'
export interface StoreSyncDeps {
  camera: GalaxyCamera
  spritePool: SpritePool | null
  swimmers: PixelySwimmer[]
  occupiedCells: Set<string>
  worldOffsetX: number
  worldOffsetY: number
  initialExternalData?: PixelData[]
  isWheelActive: () => boolean
  fetchPixelsInBBox: (forceInit?: boolean) => Promise<void>
  fetchGalaxyPixels: (galaxyKey: string) => Promise<void>
  switchGalaxyDomain: (galaxyKey: string) => void
  spatialGrid: SpatialGrid<PixelData>
  partnerCode?: string
  bondContainer: any // PIXI.Graphics
  subscriptionBondContainer: any // PIXI.Graphics [생각 구독] 황금 연결선용
}

export interface StoreSyncResult {
  cleanup: () => void
}

/**
 * 스토어 구독을 초기화하고, cleanup 함수를 반환합니다.
 */
export function initStoreSync(deps: StoreSyncDeps): StoreSyncResult {
  const {
    camera, spritePool, swimmers, occupiedCells,
    worldOffsetX, worldOffsetY, initialExternalData,
    isWheelActive, fetchPixelsInBBox,
    fetchGalaxyPixels, switchGalaxyDomain, spatialGrid, partnerCode,
  } = deps

  const isExternalMode = initialExternalData && initialExternalData.length > 0

  // 1. Viewport 동기화 (외부 Warp 감지)
  const viewportUnsub = useGalaxyStore.subscribe(
    (state) => state.viewport,
    (vp) => {
      if (!camera) return
      // [WARP LOCK] 페이드 전환 중에는 store viewport 동기화 무시
      if (useGalaxyStore.getState().isGalaxyWarping) return
      // [TWEEN LOCK] 카메라가 보간 트윈 중인 동안에는 피드백 동기화 무시
      if (camera.isTweening()) return

      const camVp = camera.viewport
      const dist = Math.hypot(vp.x - camVp.x, vp.y - camVp.y)
      const dZoom = Math.abs(vp.zoom - camVp.zoom)

      // 수동 줌 조작 중이면 동기화 무시
      if (isWheelActive()) return

      if (dist > 30000) {
        camera.warpTo(vp.x, vp.y)
        swimmers.forEach(s => s.relocate(vp.x, vp.y, vp.zoom))
      } else if (dist > 30 || dZoom > 0.01) {
        const moveDur = dist > 5000 ? 0.25 : dist > 500 ? 0.15 : 0.1
        const zoomDur = dZoom > 0.1 ? 0.3 : 0.15
        camera.moveTo(vp.x, vp.y, moveDur)
        if (dZoom > 0.01) camera.zoomTo(vp.zoom, zoomDur)
      }
    }
  )

  // 2. 미니맵 이동(Warp) 감지 시 즉시 데이터 동기화 + 소정 은하 전환
  const warpUnsub = useGalaxyStore.subscribe(
    state => state.viewport,
    (vp, prevVp) => {
      if (!camera || isExternalMode) return
      const dist = Math.hypot(vp.x - prevVp.x, vp.y - prevVp.y)

      if (dist > 5000) {
        if (useGalaxyStore.getState().isGalaxyWarping) return

        if (!partnerCode) {
          fetchPixelsInBBox(true)
          return
        }

        if (partnerCode === 'pixelyf') {
          const newDomain = getGalaxyFromCoords(
            vp.x, vp.y,
            worldOffsetX, worldOffsetY
          )

          const prevDomain = useGalaxyStore.getState().galaxyKey

          if (newDomain !== prevDomain) {
            switchGalaxyDomain(newDomain)
            fetchPixelsInBBox(true)
          } else {
            fetchPixelsInBBox(true)
          }
        }
      }
    }
  )

  // 3. AI 상호작용 상태 동기화 (Phase 5에서 구현 예정)
  const aiUnsub = useGalaxyStore.subscribe(
    (state) => ({ selectedId: state.selectedPixelId, isInteracting: state.isAiInteracting }),
    () => {
      // [CLEAN ROOM] setAiInteracting는 Phase 5에서 PixelSprite에 재구현 후 활성화
    },
    { fireImmediately: true }
  )

  // 4. 유저 프로필 변경 → 실시간 스프라이트 업데이트 (O(1) Mutable Update)
  const userUnsub = useUserStore.subscribe((state) => {
    const user = state.user
    if (!user?.id || !user.display_name) return

    // [FIX] 은하 불일치 1순위 격리 가드 장착
    // existing 분기와 관계없이 항상 현재 은하 도메인과의 일치 여부를 최선두에서 정밀 검사합니다.
    let coordX = user.coordX != null ? user.coordX * VISUAL_SCALE - worldOffsetX : undefined
    let coordY = user.coordY != null ? user.coordY * VISUAL_SCALE - worldOffsetY : undefined
    
    if (coordX != null && coordY != null) {
      const currentDomain = useGalaxyStore.getState().galaxyKey
      const myDomain = getGalaxyFromCoords(coordX, coordY, worldOffsetX, worldOffsetY)
      if (currentDomain && currentDomain !== myDomain) {
        return
      }
    }

    const existing = spatialGrid.getPixel(user.id)

    if (!existing ||
      existing.displayName !== user.display_name ||
      existing.moodId !== user.current_mood_id ||
      existing.avatarUrl !== user.avatar_url ||
      existing.statusMessage !== user.status_message
    ) {
      let finalCoordX: number
      let finalCoordY: number

      if (existing && existing.coordX !== undefined) {
        finalCoordX = existing.coordX
        finalCoordY = existing.coordY
      } else if (coordX != null && coordY != null) {
        finalCoordX = coordX
        finalCoordY = coordY
      } else {
        return 
      }

      const userPixel: PixelData = {
        pixelId: user.id,
        coordX: finalCoordX,
        coordY: finalCoordY,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        personaCode: user.persona_code || 'STARTER',
        glowColorPrimary: existing?.glowColorPrimary || '#818CF8',
        glowColorSecondary: existing?.glowColorSecondary || '#C084FC',
        zDepth: existing?.zDepth || 1.0,
        statusMessage: user.status_message,
        moodId: user.current_mood_id,
        evolutionScore: existing?.evolutionScore || 0,
        skinCode: existing?.skinCode,
        equippedSlots: existing?.equippedSlots,
      }
      
      spatialGrid.upsert(userPixel)

      const activeSprite = spritePool?.getActiveSprite(user.id)
      if (activeSprite) activeSprite.updateData(userPixel)
    }

    // [UX FIX] 유저 로그인 hydrate 완료 시 bond 렌더링 강제 재실행
    // → 새로고침 직후 최대 축소(LOD 3)에서도 내 연결선이 즉시 보이도록 트리거
    const currentBonds = useGalaxyStore.getState().bonds
    if (currentBonds.length > 0) {
      useGalaxyStore.getState().setBonds([...currentBonds])
    }
    window.dispatchEvent(new CustomEvent('user-hydrated-bonds'))
  })

  // 5. 별자리 연결(Bonds) 그래픽 동기화
  // ═══════════════════════════════════════════════════════════════
  // [설계 원칙] 3단계 파이프라인:
  //   1. 내 Bond → LOD 무관, 항상 밝게 렌더링 (alpha 0.75)
  //   2. 포커스(클릭) Bond → 밝게 렌더링 (alpha 0.75)
  //   3. 방문 흔적 Bond → LOD 1~2에서만 흐리게 (alpha 0.06, 캡 500)
  //   ※ LOD 3+ 줌아웃: 내 Bond + 포커스 Bond만 (방문 흔적 차단)
  // ═══════════════════════════════════════════════════════════════
  const VISITED_BOND_RENDER_CAP = 500 // 방문 흔적 최대 렌더링 수 (GPU 과부하 방지)
  const bondUnsub = useGalaxyStore.subscribe(
    (state) => ({
      bonds: state.bonds,
      lod: state.lodLevel,
      highlightedBondPixelId: state.highlightedBondPixelId,
      zoom: state.viewport.zoom, // 줌 레벨 추적 추가
    }),
    ({ bonds, lod, highlightedBondPixelId, zoom }) => {
      const g = deps.bondContainer
      if (!g) return

      g.clear()

      const MY_ALPHA      = 0.35  // 내 연결선: 밝기 감소 (기존 0.75)
      const FOCUS_ALPHA   = 0.35  // 클릭한 픽셀의 연결선: 밝기 감소
      const VISITED_ALPHA = 0.06  // 과거 방문 흔적: 흐린 잔상

      const currentUserId = useUserStore.getState().user?.id
      const isZoomedOut = lod >= 3
      
      // [PERFORMANCE & VISUAL] 정확한 역보정(Inverse Scale)을 통해 모니터상 두께를 정확히 1픽셀 내외로 부드럽게 유지
      // 계단 현상(Jump) 제거, 드래그(Pan) 시에는 zoom이 변하지 않으므로 재렌더링 회피(성능 최적화)
      const baseWidth = Math.max(1.0, 1.0 / zoom)
      
      let hasAnyDraw = false

      // ── 1단계: 내 Bond (LOD 무관, 항상 렌더링) ──
      if (currentUserId) {
        for (const bond of bonds) {
          const isMyBond = bond.user_a_id === currentUserId || bond.user_b_id === currentUserId
          if (!isMyBond) continue

          const p1 = spatialGrid.getPixel(bond.user_a_id)
          const p2 = spatialGrid.getPixel(bond.user_b_id)
          if (!p1 || !p2) continue

          const bondDist = Math.hypot(p1.coordX - p2.coordX, p1.coordY - p2.coordY)
          if (bondDist > 10000) continue

          const fallbackColor = p1.glowColorPrimary || '#a5b4fc'
          const colorStr = bond.bond_color || fallbackColor
          const color = parseInt(colorStr.replace('#', '0x')) || 0xa5b4fc
          const finalWidth = isZoomedOut ? baseWidth * 1.5 : baseWidth

          g.moveTo(p1.coordX, p1.coordY)
          g.lineTo(p2.coordX, p2.coordY)
          g.stroke({ color, width: finalWidth, alpha: MY_ALPHA })
          hasAnyDraw = true
        }
      }

      // ── 2단계: 포커스(클릭)된 픽셀의 Bond (내 것과 다를 때만) ──
      if (highlightedBondPixelId && highlightedBondPixelId !== currentUserId) {
        for (const bond of bonds) {
          const isFocused = bond.user_a_id === highlightedBondPixelId ||
                            bond.user_b_id === highlightedBondPixelId
          if (!isFocused) continue
          // 내 Bond로 이미 그린 선분 스킵
          if (currentUserId && (bond.user_a_id === currentUserId || bond.user_b_id === currentUserId)) continue

          const p1 = spatialGrid.getPixel(bond.user_a_id)
          const p2 = spatialGrid.getPixel(bond.user_b_id)
          if (!p1 || !p2) continue

          const bondDist = Math.hypot(p1.coordX - p2.coordX, p1.coordY - p2.coordY)
          if (bondDist > 10000) continue

          const fallbackColor = p1.glowColorPrimary || '#a5b4fc'
          const colorStr = bond.bond_color || fallbackColor
          const color = parseInt(colorStr.replace('#', '0x')) || 0xa5b4fc

          g.moveTo(p1.coordX, p1.coordY)
          g.lineTo(p2.coordX, p2.coordY)
          g.stroke({ color, width: baseWidth, alpha: FOCUS_ALPHA })
          hasAnyDraw = true
        }
      }

      // ── 3단계: 방문 흔적 (LOD 1~2에서만, 흐리게) ──
      // [PERFORMANCE] LOD 3+ 줌아웃에서는 방문 흔적 렌더링 완전 차단 (GPU 방어)
      if (!isZoomedOut) {
        let visitedDrawn = 0
        for (const bond of bonds) {
          if (visitedDrawn >= VISITED_BOND_RENDER_CAP) break

          // 이미 1~2단계에서 그린 선분 스킵
          const isMyBond = !!currentUserId &&
            (bond.user_a_id === currentUserId || bond.user_b_id === currentUserId)
          const isFocused = !!highlightedBondPixelId &&
            (bond.user_a_id === highlightedBondPixelId || bond.user_b_id === highlightedBondPixelId)
          if (isMyBond || isFocused) continue

          const p1 = spatialGrid.getPixel(bond.user_a_id)
          const p2 = spatialGrid.getPixel(bond.user_b_id)
          if (!p1 || !p2) continue

          const bondDist = Math.hypot(p1.coordX - p2.coordX, p1.coordY - p2.coordY)
          if (bondDist > 10000) continue

          const fallbackColor = p1.glowColorPrimary || '#a5b4fc'
          const colorStr = bond.bond_color || fallbackColor
          const color = parseInt(colorStr.replace('#', '0x')) || 0xa5b4fc

          g.moveTo(p1.coordX, p1.coordY)
          g.lineTo(p2.coordX, p2.coordY)
          g.stroke({ color, width: baseWidth, alpha: VISITED_ALPHA })
          visitedDrawn++
          hasAnyDraw = true
        }
      }

      g.alpha = hasAnyDraw ? 1.0 : 0
    },
    { fireImmediately: true, equalityFn: shallow }
  )

  // ═══════════════════════════════════════════════════════════════
  // 6. [생각 구독] 황금 연결선 렌더링
  // ═══════════════════════════════════════════════════════════════
  const subBondUnsub = useGalaxyStore.subscribe(
    (state) => ({
      subscriptionBonds: state.subscriptionBonds,
      lod: state.lodLevel,
      zoom: state.viewport.zoom,
    }),
    ({ subscriptionBonds, lod, zoom }) => {
      const sg = deps.subscriptionBondContainer
      if (!sg) return
      sg.clear()

      const isZoomedOut = lod >= 3
      if (isZoomedOut || subscriptionBonds.length === 0) {
        sg.alpha = 0
        return
      }

      const GOLD_COLOR = 0xF59E0B
      const SUB_ALPHA = 0.25
      const baseWidth = Math.max(1.0, 1.0 / zoom)
      let hasAny = false

      for (const bond of subscriptionBonds) {
        const p1 = spatialGrid.getPixel(bond.subscriberId)
        const p2 = spatialGrid.getPixel(bond.creatorId)
        if (!p1 || !p2) continue

        const dist = Math.hypot(p1.coordX - p2.coordX, p1.coordY - p2.coordY)
        if (dist > 10000) continue

        sg.moveTo(p1.coordX, p1.coordY)
        sg.lineTo(p2.coordX, p2.coordY)
        sg.stroke({ color: GOLD_COLOR, width: baseWidth * 1.2, alpha: SUB_ALPHA })
        hasAny = true
      }

      sg.alpha = hasAny ? 1.0 : 0
    },
    { fireImmediately: true, equalityFn: shallow }
  )
  // ═══════════════════════════════════════════════════════════════
  // 7. [생각 구독] 코어 라이트 발광 이펙트
  // ═══════════════════════════════════════════════════════════════
  const handleCoreLightEvent = (e: Event) => {
    const { creatorId } = (e as CustomEvent).detail || {}
    if (!creatorId) return

    const activeSprite = deps.spritePool?.getActiveSprite(creatorId)
    if (!activeSprite || !activeSprite.container) return

    // 황금 발광: glow scale 2배 확대 → 3초 후 원복
    const originalScale = activeSprite.container.scale?.x || 1
    const glowScale = originalScale * 2.0

    activeSprite.container.scale.set(glowScale)
    activeSprite.container.alpha = 1.0

    // 3초 선형 fade-out
    const startTime = Date.now()
    const DURATION_MS = 3000

    const fadeInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / DURATION_MS, 1)
      const currentScale = glowScale + (originalScale - glowScale) * progress
      activeSprite.container.scale.set(currentScale)

      if (progress >= 1) {
        clearInterval(fadeInterval)
        activeSprite.container.scale.set(originalScale)
      }
    }, 16) // ~60fps
  }

  window.addEventListener('subscription-core-light', handleCoreLightEvent)

  const cleanup = () => {
    viewportUnsub()
    warpUnsub()
    aiUnsub()
    userUnsub()
    bondUnsub()
    subBondUnsub()
    window.removeEventListener('subscription-core-light', handleCoreLightEvent)
  }

  return { cleanup }
}
