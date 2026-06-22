/**
 * initThoughtGraph — 생각그래프 viewMode 구독 + Web Worker 시뮬레이션 관리
 *
 * [Phase 3 Step 3] PixiApplication.tsx에서 추출
 * - viewMode 변경 구독 → 레이어 가시성 격리 전환
 * - 카메라 줌 범위 동적 설정 (setZoomRange)
 * - Web Worker 생성/종료 생명주기 관리
 * - selectedThoughtId 구독
 */
import * as PIXI from 'pixi.js'
import type { GalaxyCamera } from '@/shared/lib/pixi/camera'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { GALAXY_CENTERS } from '@/shared/lib/pixi/coordinate'
import { useGalaxyStore } from '@/stores/galaxyStore'
import type { ThoughtGraphRenderer } from '@/shared/lib/thought-graph/ThoughtGraphRenderer'

interface ThoughtGraphConfig {
  camera: GalaxyCamera
  pixiApp: PIXI.Application
  layers: {
    pixel: PIXI.Container
    connection: PIXI.Container
    effect: PIXI.Container
  }
  bondContainer: PIXI.Container
  subscriptionBondContainer: PIXI.Container
  constellationRenderer: { setVisible: (v: boolean) => void } | null
  thoughtGraphRenderer: ThoughtGraphRenderer
  thoughtRendererRef: { current: ThoughtGraphRenderer | null }
  thoughtWorkerRef: { current: Worker | null }
}

export function initThoughtGraph(config: ThoughtGraphConfig): {
  cleanup: () => void
} {
  const {
    camera,
    pixiApp,
    layers,
    bondContainer,
    subscriptionBondContainer,
    constellationRenderer,
    thoughtGraphRenderer,
    thoughtRendererRef,
    thoughtWorkerRef,
  } = config

  // ── Phase 9: viewMode 상태 구독 ──
  let prevViewMode = ''
  let prevNodesRef: any[] = []
  let prevEdgesRef: any[] = []

  const viewModeUnsub = useGalaxyStore.subscribe(
    (state) => ({
      viewMode: state.viewMode,
      nodes: state.thoughtNodes,
      edges: state.thoughtEdges,
    }),
    ({ viewMode, nodes, edges }) => {
      // 중복 리렌더링 및 미친 깜빡임 깜빡임 완벽 방지 방어막(Guard)
      const isModeChanged = prevViewMode !== viewMode
      const isDataChanged = prevNodesRef !== nodes || prevEdgesRef !== edges

      if (!isModeChanged && !isDataChanged) {
        return // 팩트: 상태 동일 시 렌더러 파괴/창조 생략
      }

      prevViewMode = viewMode
      prevNodesRef = nodes
      prevEdgesRef = edges

      const isGraph = viewMode === 'thoughtGraph'

      // [TECH DEBT Phase 1] camera.ts의 Store 의존성 제거 보완 — viewMode 전환 시 줌 범위를 외부에서 주입
      camera.setZoomRange(
        isGraph ? 0.15 : 0.031,
        isGraph ? 4.0 : 6.3,
      )

      // 1. 레이어 가시성 격리 전환
      layers.pixel.visible = !isGraph
      layers.connection.visible = !isGraph
      bondContainer.visible = !isGraph
      subscriptionBondContainer.visible = !isGraph
      layers.effect.visible = !isGraph
      // 배경 별은 생각그래프에서도 표시 (우주 배경 일관성 유지)

      // 황도 12궁 별자리 간섭 레이어 가시성 완전 격리 (디렉터님 지적 사항!)
      if (constellationRenderer) {
        constellationRenderer.setVisible(!isGraph)
      }

      thoughtGraphRenderer.setVisible(isGraph)

      if (isGraph) {
        // D3 시뮬레이션용 데이터 렌더링 (아웃라이어 픽셀 이탈 방지를 위해 날것의 노드 데이터 주입)
        thoughtGraphRenderer.renderData(nodes, edges, pixiApp)

        // 현재 은하의 물리적 중심 좌표 계산 (기본 확대 50% 포커싱 연출용)
        const currentGalaxyKey = useGalaxyStore.getState().galaxyKey
        const center = GALAXY_CENTERS[currentGalaxyKey] || { x: 0, y: 0 }

        // 생각 은하 기본 확대 비율 50% (0.5)로 카메라 줌 변경 및 은하 중심 포커스!
        camera.moveTo(center.x * VISUAL_SCALE, center.y * VISUAL_SCALE, 0.4)
        camera.zoomTo(0.35, 0.4)

        // Web Worker 시뮬레이션 시작
        if (!thoughtWorkerRef.current) {
          thoughtWorkerRef.current = new Worker(
            new URL('../../../shared/lib/thought-graph/ThoughtGraphWorker.ts', import.meta.url)
          )
          thoughtWorkerRef.current.onmessage = (event) => {
            const { type, coords } = event.data
            if (type === 'TICK') {
              const currentZoom = camera.viewport.zoom
              thoughtRendererRef.current?.updatePositions(coords, currentZoom)
            }
          }
        }

        thoughtWorkerRef.current.postMessage({
          type: 'INIT',
          nodes,
          edges,
          centerX: center.x * VISUAL_SCALE,
          centerY: center.y * VISUAL_SCALE
        })
      } else {
        // 복귀 시 시뮬레이션 정지 및 스레드 해제
        if (thoughtWorkerRef.current) {
          thoughtWorkerRef.current.postMessage({ type: 'STOP' })
          thoughtWorkerRef.current.terminate()
          thoughtWorkerRef.current = null
        }
      }
    }
  )

  // ── Phase 10: 생각 노드 선택 상태 구독 ──
  const selectedThoughtUnsub = useGalaxyStore.subscribe(
    (state) => state.selectedThoughtId,
    (selectedThoughtId) => {
      if (useGalaxyStore.getState().viewMode === 'thoughtGraph' && thoughtRendererRef.current) {
        // [FIX #1] group.x/y는 부유 오프셋(floatX/Y) 누적 좌표이므로
        // D3 물리 원점인 targetX/targetY를 사용해야 함
        const coords = Array.from(thoughtRendererRef.current.getSpritesMap().entries()).map(([id, group]) => ({
          id,
          x: (group as any).targetX ?? group.x,
          y: (group as any).targetY ?? group.y,
        }))
        const currentZoom = camera.viewport.zoom
        thoughtRendererRef.current.updatePositions(coords, currentZoom)
      }
    }
  )

  return {
    cleanup: () => {
      // [생각그래프] 스레드 및 렌더러 소멸
      if (thoughtWorkerRef.current) {
        thoughtWorkerRef.current.postMessage({ type: 'STOP' })
        thoughtWorkerRef.current.terminate()
        thoughtWorkerRef.current = null
      }
      if (thoughtRendererRef.current) {
        thoughtRendererRef.current.destroy()
        thoughtRendererRef.current = null
      }
      viewModeUnsub()
      selectedThoughtUnsub()
    },
  }
}
