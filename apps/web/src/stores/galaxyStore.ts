import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { PingId } from '@/shared/constants/pings'
import type { GalaxyKey } from '@/shared/constants/galaxySystem'
import type { Viewport } from '@/shared/lib/pixi/camera'
import type { GalaxyDomain } from '@/shared/lib/pixi/coordinate'
import type { SpatialGrid } from '@/shared/lib/pixi/spatialGrid'
import type { ThoughtNodeData, ThoughtEdge } from '@/shared/lib/thought-graph/types'
import { CAMERA_ZOOM } from '@/shared/constants/camera'

/** 프로젝트 전역 기본 무드 ID 상수 */
export const DEFAULT_MOOD_ID = 'shining'

/** [줌 엔진] 전역 최대 줌 상수 — 이 값을 초과하는 zoom은 store 진입 시 클램핑됩니다 */
const MAX_ZOOM = 6.3
const MIN_ZOOM = 0.031

export interface PixelData {
  pixelId: string
  coordX: number
  coordY: number
  zDepth?: number
  personaCode?: string
  displayName?: string
  avatarUrl?: string
  statusMessage?: string
  supernovaTier?: string
  supernovaExpiresAt?: string
  glowColorPrimary: string
  glowColorSecondary: string
  pingCount?: number
  pingTypes?: PingId[]
  touchCount?: number
  latestMoment?: {
    category: 'mood' | 'object' | 'activity'
  }
  momentContent?: string
  momentThumbnail?: string
  momentId?: string
  evolutionScore?: number  // [EVOLUTION] activity_score 기반 연속 진화 점수
  moodId?: string
  // [아바타 꾸미기] Spine 캐릭터 설정
  skinCode?: string                          // base_character (ex: "spineboy", "mix-and-match")
  equippedSlots?: Record<string, string>     // 부위별 장착 아이템
  country?: string
  rank?: number
  // [09-플랜] 매장 픽셀 전용 필드
  isStore?: boolean      // 매장 픽셀 여부 (users.is_store에서 읽어옴, 캔버스 렌더러 분기 판별용)
  storeRating?: number   // 베이지안 신뢰 별점 (batch 계산 후 StoreDetail.average_rating에 저장, 골드 뱃지 표시용)
  reviewCount?: number   // 누적 리뷰 수 (StoreDetail.review_count)
}

export interface ConstellationBond {
  id: string
  user_a_id: string
  user_b_id: string
  bond_color?: string
  /** 렌더링 대상: accepted 상태만 galaxy canvas에 표시 */
  status?: string
}

/** 설정 UI용 소셜 연결 전역 상태 */
export interface SocialBondsState {
  bonds: ConstellationBond[]        // accepted — 연결 완료
  pendingReceived: ConstellationBond[] // 받은 요청
  pendingSent: ConstellationBond[]     // 보낸 요청
  lastFetched: number | null        // 마지막 fetch 시각 (ms)
}

/** [생각 구독] 황금 연결선 렌더링용 Bond */
export interface SubscriptionBond {
  subscriberId: string
  creatorId: string
}

interface GalaxyState {
  // [ARCHITECTURE REFACTOR] pixels Map 객체는 SpatialGrid 단일 진실 공급원으로 이관됨
  spatialGrid: SpatialGrid<PixelData> | null
  gridsData: Record<string, {
    cells: Map<string, PixelData[]>
    idToCellKey: Map<string, string>
    idToLastAccess: Map<string, number>
  }>
  viewports: Record<string, Viewport>
  bondsMap: Record<string, ConstellationBond[]>
  /** galaxy canvas 렌더링용: accepted 상태만 */
  bonds: ConstellationBond[]
  /** [생각 구독] 황금 연결선 렌더링용 구독 관계 Bond */
  subscriptionBonds: SubscriptionBond[]
  /** 설정 UI용 소셜 연결 전역 상태 (fetch 결과 캐시) */
  socialBonds: SocialBondsState
  /** [모바일] 캔버스 미렌더링 상태에서 패널 오픈 시 임시 데이터를 보관하는 상태 */
  preloadedPixelData: PixelData | null
  /** 검색 패널 등에서 특정 피드를 클릭했을 때 해당 피드로 포커스(스크롤/상단고정)하기 위한 데이터 */
  targetFeedItem: Record<string, any> | null
  selectedPixelId: string | null
  /** bonds 하이라이트 전용 (선택된 픽셀과 독립적, 기본값 = 로그인 유저) */
  highlightedBondPixelId: string | null
  hoveredPixelId: string | null
  /** [3축 전환] 현재 활성 은하 키 */
  galaxyKey: GalaxyKey
  /** [3축 전환] 현재 활성 카테고리 (null = 전체) */
  activeCategory: string | null
  /** @deprecated 하위호환: 엔진 내부용. Phase 완료 후 제거 예정 */
  galaxyDomain: GalaxyDomain
  filterCategory: 'mood' | 'object' | 'activity' | null
  viewport: Viewport
  lodLevel: 1 | 2 | 3 | 4
  currentMoodId: string
  selectedFilterMoodId: string | null
  isAiInteracting: boolean
  isPixiReady: boolean
  isSearchFeedOpen: boolean
  isMomentModalOpen: boolean
  isGalaxyWarping: boolean
  pixelPanelWidth: number
  activeDmRoomId: string | null
  activePanelMoodId: string | null // [NEW] 활성 픽셀 판넬 주인의 생각 상태 ID
  isSettingsOpen: boolean // [NEW] 설정 모달 오픈 여부
  setIsSettingsOpen: (isOpen: boolean) => void // [NEW] 설정 모달 오픈 제어 액션
  isInsightOpen: boolean // [NEW] 인사이트 모달 오픈 여부
  setIsInsightOpen: (isOpen: boolean) => void // [NEW] 인사이트 모달 오픈 제어 액션
  isTourOpen: boolean // [NEW] UI/UX 툴팁 투어 가이드 오픈 여부
  setIsTourOpen: (isOpen: boolean) => void // [NEW] 투어 가이드 오픈 제어 액션
  tourMode: 'all' | 'panel' | null // [NEW] 투어 모드
  setTourMode: (mode: 'all' | 'panel' | null) => void // [NEW] 투어 모드 설정 액션

  // [Phase 3] 참여형 은하 상태
  isJoinModalOpen: boolean
  pendingJoinGalaxyKey: string | null

  // [Settings] 풀스크린 모바일 대응 마이페이지 모달 (제거됨)

  setSpatialGrid: (grid: SpatialGrid<PixelData>) => void
  setBonds: (bonds: ConstellationBond[]) => void
  setSubscriptionBonds: (bonds: SubscriptionBond[]) => void
  setSocialBonds: (state: SocialBondsState) => void
  setPreloadedPixelData: (data: PixelData | null) => void
  setTargetFeedItem: (feed: Record<string, any> | null) => void
  selectPixel: (pixelId: string | null) => void
  setHighlightedBondPixelId: (pixelId: string | null) => void
  setHoveredPixelId: (pixelId: string | null) => void
  setGalaxyKey: (key: GalaxyKey) => void
  setActiveCategory: (category: string | null) => void
  /** @deprecated 하위호환용. setGalaxyKey 사용 권장 */
  setGalaxyDomain: (domain: GalaxyDomain) => void
  setMood: (moodId: string) => void
  setFilter: (category: GalaxyState['filterCategory']) => void
  setViewport: (viewport: Partial<Viewport>) => void
  setLOD: (level: 1 | 2 | 3 | 4) => void
  focusOnPosition: (x: number, y: number, zoom?: number, showPing?: boolean) => void
  setSelectedFilterMoodId: (moodId: string | null) => void
  setIsAiInteracting: (val: boolean) => void
  setIsPixiReady: (val: boolean) => void
  setIsSearchFeedOpen: (isOpen: boolean) => void
  setIsMomentModalOpen: (isOpen: boolean) => void
  setIsGalaxyWarping: (val: boolean) => void
  setPixelPanelWidth: (width: number) => void
  setActiveDmRoomId: (id: string | null) => void
  setActivePanelMoodId: (moodId: string | null) => void // [NEW] 활성 픽셀 판넬 생각 상태 설정 액션

  setIsJoinModalOpen: (isOpen: boolean) => void
  setPendingJoinGalaxyKey: (key: string | null) => void

  // [생각그래프] ThoughtGraph 슬라이스
  viewMode: 'pixelyer' | 'thoughtGraph'
  setViewMode: (mode: 'pixelyer' | 'thoughtGraph') => void
  thoughtScope: 'all' | 'mine'
  setThoughtScope: (scope: 'all' | 'mine') => void
  thoughtNodes: ThoughtNodeData[]
  thoughtEdges: ThoughtEdge[]
  thoughtTotalCount: number
  thoughtCategoryCounts: Record<string, number>
  setThoughtData: (nodes: ThoughtNodeData[], edges: ThoughtEdge[], totalCount?: number, categoryCounts?: Record<string, number>) => void
  selectedThoughtId: string | null
  selectThought: (momentId: string | null) => void
  hoveredThoughtId: string | null
  setHoveredThoughtId: (momentId: string | null) => void
  isThoughtGraphLoading: boolean
  setIsThoughtGraphLoading: (val: boolean) => void
  preConnectedThought: { id: string; content: string; relationType: 'extends' | 'supports' | 'contradicts' } | null
  setPreConnectedThought: (thought: { id: string; content: string; relationType: 'extends' | 'supports' | 'contradicts' } | null) => void
  synthesizedDraft: string | null
  setSynthesizedDraft: (draft: string | null) => void
  reviewTargetPixelId: string | null
  setReviewTargetPixelId: (id: string | null) => void
}

export const useGalaxyStore = create<GalaxyState>()(
  subscribeWithSelector((set, get) => ({
    spatialGrid: null,
    gridsData: {},
    viewports: {},
    bondsMap: {},
    bonds: [],
    subscriptionBonds: [],
    socialBonds: { bonds: [], pendingReceived: [], pendingSent: [], lastFetched: null },
    preloadedPixelData: null,
    targetFeedItem: null,
    selectedPixelId: null,
    highlightedBondPixelId: null,
    hoveredPixelId: null,
    galaxyKey: 'PIXELYF',
    activeCategory: null,
    galaxyDomain: 'PIXELYF',  // @deprecated 하위호환
    filterCategory: null,
    viewport: { x: 0, y: 0, zoom: 0.05 },
    lodLevel: 1,
    currentMoodId: 'shining',
    selectedFilterMoodId: null,
    isAiInteracting: false,
    isPixiReady: false,

    isSearchFeedOpen: true,
    isMomentModalOpen: false,
    isGalaxyWarping: false,
    pixelPanelWidth: 520,
    activeDmRoomId: null,
    activePanelMoodId: null, // [NEW] 초기값 null
    isSettingsOpen: false,
    isInsightOpen: false, // [NEW] 초기값 false
    isTourOpen: false, // [NEW] 초기값 false
    tourMode: null, // [NEW] 초기값 null

    isJoinModalOpen: false,
    pendingJoinGalaxyKey: null,

    setSpatialGrid: (grid) => {
      set({ spatialGrid: grid })
    },
    setBonds: (bonds) => {
      const key = get().galaxyKey
      const nextBondsMap = { ...get().bondsMap, [key]: bonds }
      set({ bonds, bondsMap: nextBondsMap })
    },
    setSubscriptionBonds: (bonds) => set({ subscriptionBonds: bonds }),
    setSocialBonds: (state) => set({ socialBonds: state }),
    setPreloadedPixelData: (data) => set({ preloadedPixelData: data }),
    setTargetFeedItem: (feed) => set({ targetFeedItem: feed }),

    selectPixel: (pixelId) => {
      // 픽셀이 새로 선택되거나 닫힐 때 기존 스포트라이트 타겟은 항상 무조건 청소하여 캔버스 클릭 시 전체보기 보장
      set({ selectedPixelId: pixelId, activeDmRoomId: null, targetFeedItem: null })
      // 선택 해제 시 프리로드 데이터 및 인사이트 오픈 상태 정리
      if (pixelId === null) {
        set({ preloadedPixelData: null, isInsightOpen: false })
      }
      // 픽셀 선택 시 bonds 하이라이트도 동기화 (판넬 닫기 selectPixel(null) 시에는 변경하지 않음)
      if (pixelId !== null) {
        set({ highlightedBondPixelId: pixelId })
      }
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        if (pixelId) {
          url.searchParams.set('pixel', pixelId)
          url.searchParams.delete('feed')
        } else {
          url.searchParams.delete('pixel')
        }
        window.history.replaceState(null, '', url.toString())
      }
    },
    setHighlightedBondPixelId: (pixelId) => set({ highlightedBondPixelId: pixelId }),
    setHoveredPixelId: (pixelId) => set({ hoveredPixelId: pixelId }),
    setGalaxyKey: (key) => {
      const prevKey = get().galaxyKey
      const currentVp = get().viewport
      const currentBonds = get().bonds
      const currentGrid = get().spatialGrid

      const nextGridsData = { ...get().gridsData }
      if (currentGrid) {
        nextGridsData[prevKey] = currentGrid.exportState()
      }

      const nextViewports = { ...get().viewports, [prevKey]: currentVp }
      const nextBondsMap = { ...get().bondsMap, [prevKey]: currentBonds }

      const nextGridState = nextGridsData[key] || {
        cells: new Map(),
        idToCellKey: new Map(),
        idToLastAccess: new Map()
      }

      if (currentGrid) {
        currentGrid.importState(nextGridState)
      }

      const nextVp = nextViewports[key] || { x: 0, y: 0, zoom: 0.05 }
      const nextB = nextBondsMap[key] || []

      set({
        galaxyKey: key,
        galaxyDomain: key,
        activeCategory: null,
        activeDmRoomId: null,
        viewport: nextVp,
        bonds: nextB,
        gridsData: nextGridsData,
        viewports: nextViewports,
        bondsMap: nextBondsMap
      })

      get().selectPixel(null)
      get().selectThought(null)
    },
    setActiveCategory: (category) => set({ activeCategory: category, activeDmRoomId: null }),
    setGalaxyDomain: (domain) => set({ galaxyDomain: domain }),

    setMood: (moodId) => set({ currentMoodId: moodId }),

    setFilter: (category) => {
      set({ filterCategory: category })
    },

    setViewport: (viewport) =>
      set((state) => {
        const nextVp = {
          ...state.viewport,
          ...viewport,
          ...(viewport.zoom !== undefined
            ? { zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom)) }
            : {}),
        }
        const key = state.galaxyKey
        const nextViewports = { ...state.viewports, [key]: nextVp }
        return {
          viewport: nextVp,
          viewports: nextViewports
        }
      }),

    setLOD: (lodLevel) => set({ lodLevel }),

    focusOnPosition: (x, y, zoom, showPing) => {
      const clampedZoom = zoom !== undefined
        ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
        : undefined

      // [CRITICAL] 엔진 미초기화 상태에서만 스토어에 좌표를 저장합니다.
      // PixiApplication 초기화 시 이 좌표를 읽어 워프합니다.
      // 엔진 가동 중에는 set()을 호출하면 storeSync가 즉시 warpTo/moveTo(0.1초)를
      // 실행하여 camera-focus의 부드러운 0.5초 애니메이션을 죽이므로 건너뜁니다.
      if (!get().isPixiReady) {
        set((state) => ({
          viewport: {
            ...state.viewport,
            x,
            y,
            zoom: clampedZoom ?? state.viewport.zoom
          }
        }))
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('camera-focus', {
          detail: { x, y, zoom: clampedZoom ?? CAMERA_ZOOM.PIXEL_FOCUS, showPing }
        }))
      }
    },

    setSelectedFilterMoodId: (moodId) => set({ selectedFilterMoodId: moodId }),

    setIsAiInteracting: (val) => set({ isAiInteracting: val }),
    setIsPixiReady: (val) => set({ isPixiReady: val }),
    setIsSearchFeedOpen: (isOpen) => set({ isSearchFeedOpen: isOpen }),
    setIsMomentModalOpen: (isOpen) => set({ isMomentModalOpen: isOpen }),
    setIsGalaxyWarping: (val) => set({ isGalaxyWarping: val }),
    setPixelPanelWidth: (width) => set({ pixelPanelWidth: width }),
    setActiveDmRoomId: (id) => set({ activeDmRoomId: id }),
    setActivePanelMoodId: (moodId) => set({ activePanelMoodId: moodId }),
    setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
    setIsInsightOpen: (isOpen) => set({ isInsightOpen: isOpen }), // [NEW] 인사이트 제어 액션
    setIsTourOpen: (isOpen) => set((state) => ({ 
      isTourOpen: isOpen, 
      tourMode: isOpen ? (state.tourMode || 'all') : null 
    })),
    setTourMode: (mode) => set({ tourMode: mode }),
    setIsJoinModalOpen: (isOpen) => set({ isJoinModalOpen: isOpen }),
    setPendingJoinGalaxyKey: (key) => set({ pendingJoinGalaxyKey: key }),

    // [생각그래프] ThoughtGraph 슬라이스
    viewMode: 'pixelyer',
    setViewMode: (mode) => set({ viewMode: mode }),
    thoughtScope: 'all',
    setThoughtScope: (scope) => set({ thoughtScope: scope }),
    thoughtNodes: [],
    thoughtEdges: [],
    thoughtTotalCount: 0,
    thoughtCategoryCounts: {},
    setThoughtData: (nodes, edges, totalCount, categoryCounts) => set({
      thoughtNodes: nodes,
      thoughtEdges: edges,
      thoughtTotalCount: totalCount ?? nodes.length,
      thoughtCategoryCounts: categoryCounts ?? {},
    }),
    selectedThoughtId: null,
    selectThought: (momentId) => set({ selectedThoughtId: momentId }),
    hoveredThoughtId: null,
    setHoveredThoughtId: (momentId) => set({ hoveredThoughtId: momentId }),
    isThoughtGraphLoading: false,
    setIsThoughtGraphLoading: (val) => set({ isThoughtGraphLoading: val }),
    preConnectedThought: null,
    setPreConnectedThought: (thought) => set({ preConnectedThought: thought }),
    synthesizedDraft: null,
    setSynthesizedDraft: (draft) => set({ synthesizedDraft: draft }),
    reviewTargetPixelId: null,
    setReviewTargetPixelId: (id) => set({ reviewTargetPixelId: id }),
  }))
)
