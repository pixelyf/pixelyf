/**
 * DataSync — 갤럭시 엔진의 데이터 동기화 모듈
 * 
 * [CLEAN ROOM REBUILD] 2026-05-01
 * 역할: Supabase BBox 쿼리, 실시간 채널 구독, 디바운스 fetch
 * 성능 원칙:
 *   1. 150% 뷰포트 기반 BBox로 필요한 데이터만 정확히 가져옴
 *   2. 이미 로드된 영역 내부라면 재쿼리 차단
 *   3. 동시 실행 방지 (isFetching 락)
 */
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { PingId } from '@/shared/constants/pings'
import { getMoodColors } from '@/shared/constants/moods'
import { useGalaxyStore, type PixelData, type ConstellationBond, DEFAULT_MOOD_ID } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { idbGet, idbSet } from '@/shared/lib/idb'
import { SpatialGrid } from '@/shared/lib/pixi/spatialGrid'
import { SpritePool } from '@/shared/lib/pixi/culling'
import { GalaxyCamera } from '@/shared/lib/pixi/camera'
import { getLODLevel } from '@/shared/lib/pixi/lod'
import type { GalaxyDomain } from '@/shared/lib/pixi/coordinate'

export interface DataSyncDeps {
  supabaseClient: any
  camera: GalaxyCamera
  spatialGrid: SpatialGrid<PixelData>
  spritePool: SpritePool | null
  worldContainer: import('pixi.js').Container
  occupiedCells: Set<string>
  worldOffsetX: number
  worldOffsetY: number
  galaxyGroup: string
  partnerCode?: string
  initialExternalData?: PixelData[]
  swimmers: any[]
  pulseManager: any
  setLoadingStatus: (s: string) => void
  setLoadingProgress: (p: number) => void
  setVisiblePixels: (n: number) => void
  setIsLoaderActive: (b: boolean) => void
  isCancelledRef: { current: boolean }
}

export interface DataSyncResult {
  fetchPixelsInBBox: (forceInit?: boolean, forceBypassThreshold?: boolean) => Promise<void>
  fetchGalaxyPixels: (galaxyKey: string) => Promise<void>
  switchGalaxyDomain: (galaxyKey: string) => void
  debouncedFetch: () => void
  subscribeChannels: () => { pulseUnsub: any; coordUnsub: any }
  setSpritePool: (sp: SpritePool) => void
  fetchBonds: (pixels: PixelData[]) => Promise<any>
  fetchMyBonds: () => Promise<ConstellationBond[]>
  fetchBondsForPixel: (pixelId: string) => Promise<ConstellationBond[]>
  fetchMySubscriptionBonds: () => Promise<void>
  cleanup: () => void
}

export function initDataSync(deps: DataSyncDeps): DataSyncResult {
  const {
    supabaseClient, camera, spatialGrid, worldContainer, occupiedCells,
    worldOffsetX, worldOffsetY, galaxyGroup, partnerCode,
    initialExternalData, swimmers, pulseManager,
    setLoadingStatus, setLoadingProgress, setVisiblePixels, setIsLoaderActive,
    isCancelledRef,
  } = deps

  let lastFetchedBBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, zoom: 0 }
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null
  let swrTimeout: ReturnType<typeof setTimeout> | null = null // SWR Revalidate 비동기 갱신 관리용 타이머
  let lastFetchTime = 0
  let isFetching = false
  let isDomainSwitching = false // 점진적 은하 스왑 관리 플래그
  let spritePoolRef = deps.spritePool

  // [REALTIME LEAK PROTECTION] 활성 Supabase 채널 및 탭 전환 리스너 레퍼런스
  let activePulseChannel: any = null
  let activeCoordChannel: any = null
  let visibilityListener: (() => void) | null = null

  const setSpritePool = (sp: SpritePool) => { spritePoolRef = sp }

  // ─── Bonds (연결선) SWR (Stale-While-Revalidate) 아키텍처 ───
  
  interface CachedBonds {
    updatedAt: number
    bonds: ConstellationBond[]
  }
  const LS_KEY = 'pixelyf_visited_bonds'
  const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90일 (SWR 패턴)
  const MAX_CACHE_SIZE = 50 // [설계 원칙] 최근 조회한 50명의 픽셀 연결선 보관 (쇼핑몰 최근 본 상품 패턴)

  /** IndexedDB 유틸리티 (TTL 자동 만료 적용) */
  const getIdbCache = async (): Promise<Record<string, CachedBonds>> => {
    const raw = (await idbGet<Record<string, CachedBonds>>(LS_KEY)) || {}
    const now = Date.now()
    let dirty = false
    for (const key of Object.keys(raw)) {
      if (now - raw[key].updatedAt > TTL_MS) {
        delete raw[key]
        dirty = true
      }
    }
    if (dirty) idbSet(LS_KEY, raw).catch(console.error)
    return raw
  }

  const saveIdbCache = async (pixelId: string, bonds: ConstellationBond[]) => {
    const cache = await getIdbCache()
    cache[pixelId] = { updatedAt: Date.now(), bonds }
    
    // LRU (가장 오래된 데이터 밀어내기)
    const keys = Object.keys(cache)
    if (keys.length > MAX_CACHE_SIZE) {
      keys.sort((a, b) => cache[a].updatedAt - cache[b].updatedAt)
      const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE)
      for (const k of toRemove) delete cache[k]
    }
    await idbSet(LS_KEY, cache)
  }

  /** 내 bond 로드 + SWR 초기화 (새로고침 시 호출) */
  const fetchMyBonds = async (): Promise<ConstellationBond[]> => {
    if (!supabaseClient) return []
    try {
      // 1. IDB에서 방문했던 픽셀들의 흔적 가져오기 (통신 없음) - 무조건 로드
      const lsCache = await getIdbCache()
      const visitedBonds = Object.values(lsCache).flatMap(c => c.bonds)

      let myBonds: ConstellationBond[] = []
      const myId = useUserStore.getState().user?.id

      if (myId) {
        // 2. 내 bond 가져오기 (서버 통신) - 로그인된 경우만
        const { data, error } = await supabaseClient
          .from('constellation_bonds')
          .select('id, user_a_id, user_b_id, bond_color, status')
          .eq('status', 'accepted')
          .or(`user_a_id.eq.${myId},user_b_id.eq.${myId}`)

        if (!error && data) myBonds = data as ConstellationBond[]
      }

      // 3. Store에 병합하여 즉시 띄우기 (내 선분 + 과거 방문 흔적)
      useGalaxyStore.getState().setBonds([...myBonds, ...visitedBonds])
      return myBonds
    } catch (err) {
      console.error('[DataSync] MyBonds Fetch Error:', err)
      return []
    }
  }

  // 로그인/Hydration 완료 시 다시 호출하기 위한 리스너
  if (typeof window !== 'undefined') {
    window.addEventListener('user-hydrated-bonds', () => {
      fetchMyBonds()
    })
  }

  /** 클릭한 픽셀의 bond를 SWR 패턴으로 로드 */
  const fetchBondsForPixel = async (pixelId: string): Promise<ConstellationBond[]> => {
    if (!pixelId || !supabaseClient) return []

    // [즉시 렌더링 - Stale] IDB 우선 확인 후 즉시 반영 (0ms)
    const cache = await getIdbCache()
    const cachedData = cache[pixelId]
    if (cachedData) {
      _mergeBondsIntoStore(cachedData.bonds)
    }

    // [백그라운드 동기화 - Revalidate]
    try {
      const { data, error } = await supabaseClient
        .from('constellation_bonds')
        .select('id, user_a_id, user_b_id, bond_color, status')
        .eq('status', 'accepted')
        .or(`user_a_id.eq.${pixelId},user_b_id.eq.${pixelId}`)

      if (error || !data) return []
      const freshBonds = data as ConstellationBond[]
      
      // 최신 데이터로 IndexedDB 및 UI 갱신
      await saveIdbCache(pixelId, freshBonds)
      _mergeBondsIntoStore(freshBonds)
      return freshBonds
    } catch (err) {
      console.error('[DataSync] PixelBonds SWR Error:', err)
      return []
    }
  }

  /** 새 bond를 기존 store에 중복 없이 병합 */
  const _mergeBondsIntoStore = (newBonds: ConstellationBond[]) => {
    const current = useGalaxyStore.getState().bonds
    // Set을 이용한 중복 제거
    const bondMap = new Map()
    current.forEach(b => bondMap.set(b.id, b))
    newBonds.forEach(b => bondMap.set(b.id, b))
    
    const merged = Array.from(bondMap.values())
    if (merged.length !== current.length) {
      useGalaxyStore.getState().setBonds(merged)
    }
  }

  /** [하위호환] 기존 fetchAndStoreBonds */
  const fetchAndStoreBonds = async (_pixels: PixelData[]) => {
    return fetchMyBonds()
  }

  /** [생각 구독] 구독 관계 Bond 로드 (fetch → store) */
  const fetchMySubscriptionBonds = async () => {
    const myId = useUserStore.getState().user?.id
    if (!myId) return
    try {
      const res = await fetch('/api/subscriptions/bonds')
      if (!res.ok) return
      const data = await res.json()
      useGalaxyStore.getState().setSubscriptionBonds(data.bonds || [])
    } catch (e) {
      console.error('[DataSync] fetchMySubscriptionBonds error:', e)
    }
  }

  // ─── 핵심: BBox 기반 픽셀 데이터 로딩 ───

  let pendingFetchArgs: { forceInit: boolean, forceBypassThreshold: boolean } | null = null

  const fetchPixelsInBBox = async (forceInit = false, forceBypassThreshold = false) => {
    if (isFetching) {
      pendingFetchArgs = { forceInit, forceBypassThreshold }
      return
    }
    if (!camera || !supabaseClient) return
    if (initialExternalData && initialExternalData.length > 0) return
    if (useGalaxyStore.getState().isGalaxyWarping && !forceInit) return

    isFetching = true
    const fetchStart = performance.now()
    const queryDomain = useGalaxyStore.getState().galaxyDomain // [Session Guard] 비동기 쿼리 시작 시점의 도메인 캡처

    try {
      const { x, y, zoom } = camera.viewport

      // 150% 뷰포트: 패딩 = 뷰포트 반폭의 0.5배 (총 영역 = 뷰포트의 150%)
      const pad = (camera.canvasWidth / 2) / zoom * 0.5

      const absoluteX = x + worldOffsetX
      const absoluteY = y + worldOffsetY
      const minX = (absoluteX - (camera.canvasWidth / 2) / zoom - pad) / VISUAL_SCALE
      const maxX = (absoluteX + (camera.canvasWidth / 2) / zoom + pad) / VISUAL_SCALE
      const minY = (absoluteY - (camera.canvasHeight / 2) / zoom - pad) / VISUAL_SCALE
      const maxY = (absoluteY + (camera.canvasHeight / 2) / zoom + pad) / VISUAL_SCALE

      // 이미 로드된 BBox 내부라면 재쿼리 차단
      if (!forceInit && !forceBypassThreshold) {
        if (minX >= lastFetchedBBox.minX && maxX <= lastFetchedBBox.maxX &&
            minY >= lastFetchedBBox.minY && maxY <= lastFetchedBBox.maxY) {
          return
        }
        const dx = Math.abs(minX - lastFetchedBBox.minX)
        const dy = Math.abs(minY - lastFetchedBBox.minY)
        const dw = Math.abs(maxX - minX)
        if (dx < dw * 0.02 && dy < dw * 0.02 && Math.abs(zoom - lastFetchedBBox.zoom) < 0.005) {
          return
        }
      }

      lastFetchedBBox = { minX, maxX, minY, maxY, zoom }

      const currentGalaxyDomain = useGalaxyStore.getState().galaxyDomain
      const activeCategory = useGalaxyStore.getState().activeCategory

      // [0초 로딩 SWR] 캐시 주입 및 조기 리턴 (백그라운드로 쿼리 넘김)
      if (forceInit && !initialExternalData) {
        const cacheKey = `pixelyf_galaxy_grid_${currentGalaxyDomain}${activeCategory ? "_" + activeCategory : ""}`
        const cachedGrid = await idbGet<PixelData[]>(cacheKey)
        if (cachedGrid && cachedGrid.length > 0) {
          // [FIX] 백그라운드 Supabase 데이터 페칭 완료 시점에 불필요한 이중 클리어(clear/releaseAll) 깜빡임 방지
          if (isDomainSwitching) {
            spatialGrid.clear()
            if (spritePoolRef) spritePoolRef.releaseAll()
            isDomainSwitching = false
          }
          spatialGrid.insertMany(cachedGrid)
          cachedGrid.forEach(p => {
            const activeSprite = spritePoolRef?.getActiveSprite(p.pixelId)
            if (activeSprite) {
              activeSprite.updateData(p)
              activeSprite.applyLOD(getLODLevel(camera.viewport.zoom))
            }
          })
          setVisiblePixels(spatialGrid.getAll().length)
          
          isFetching = false
          swrTimeout = setTimeout(() => {
            fetchPixelsInBBox(false, true).catch(console.error)
          }, 10)
          
          return // 즉시 리턴 -> await 해제 -> 로딩 스피너 종료
        } else {
          // [FIX] 캐시가 존재하지 않는 은하 최초 진입 시, 네트워크 요청 시작 전 이전 은하 잔상을 즉시 소거
          if (isDomainSwitching) {
            spatialGrid.clear()
            if (spritePoolRef) spritePoolRef.releaseAll()
            isDomainSwitching = false
          }
        }
      }

      setLoadingStatus('Syncing Stars...')

      // 카테고리가 선택된 경우 해당 카테고리의 모먼트가 있는 유저만 가져오기 위해 inner join 사용
      const momentsSelect = activeCategory 
        ? `moments!moments_user_id_fkey!inner (id, content, images, created_at, ping_count, is_deleted, category, content_category)`
        : `moments!moments_user_id_fkey (id, content, images, created_at, ping_count, is_deleted, category, content_category)`

      // Supabase 쿼리 (페이지네이션)
      const selectFields = `user_id, coord_x, coord_y, z_depth, rank, partner_code, display_name, avatar_image_url,
        users!inner (display_name, avatar_image_url, status_message, activity_score, galaxy_activity_scores, current_mood_id, country, supernova_tier, supernova_expires_at, is_store,
          user_personas (persona_code, glow_color_primary, glow_color_secondary),
          avatar_config:user_avatar_config (base_character, equipped_slots),
          store_detail:store_details (review_count, average_rating),
          ${momentsSelect},
          pings!receiver_id (ping_type))`

      let allDbCoords: any[] = []
      let from = 0
      const STEP = 1000

      while (true) {
        if (isCancelledRef.current) break

        let query = supabaseClient.from('user_coordinates').select(selectFields)
          .gte('coord_x', minX).lte('coord_x', maxX)
          .gte('coord_y', minY).lte('coord_y', maxY)
          .order('rank', { ascending: true })
          .order('user_id', { ascending: true })
          .range(from, from + STEP - 1)

        if (partnerCode && currentGalaxyDomain) {
          query = query.eq('galaxy_key', currentGalaxyDomain)
        }

        if (activeCategory) {
          query = query.eq('users.moments.content_category', activeCategory)
            .eq('users.moments.is_deleted', false)
        }

        query = query
          .order('created_at', { foreignTable: 'users.moments', ascending: false })
          .order('created_at', { foreignTable: 'users.pings', ascending: false })
          .limit(3, { foreignTable: 'users.pings' })

        const { data, error } = await query

        if (error) {
          const silentCodes = ['PGRST301', '42501']
          if (!error.message || error.message === '' || silentCodes.includes(error.code)) break
          console.warn('[DataSync] BBox Fetch:', error.message)
          break
        }
        if (!data || data.length === 0) break

        allDbCoords = [...allDbCoords, ...data]
        from += STEP

        // 프로그레스 업데이트
        setLoadingProgress(Math.min(70, 30 + (allDbCoords.length / 20) * 40))

        if (data.length < STEP) break
      }

      // 데이터 변환 및 SpatialGrid 삽입
      const newPixels: PixelData[] = []
      let hasUpdates = false  // 기존 픽셀 업데이트 추적 (IDB 캐시 갱신 트리거용)

      // ── [ACTIVE EVICTION] DB에서 삭제된 픽셀 색출 및 소거 ──
      // DB 조회 완료 시점(중단되지 않음)에만 구동하여 네트워크 불안정 시 오삭제 방지
      // [PERF v2 FIX] BBox 밖 픽셀 오판 방지를 위해 엄격한 좌표 경계 체크 추가 및 카테고리 필터링이 없을 때만 가동
      if (!isCancelledRef.current && !activeCategory) {
        const freshUserIds = new Set<string>(allDbCoords.map(coord => coord.user_id))
        const dbMinX = minX * VISUAL_SCALE - worldOffsetX
        const dbMaxX = maxX * VISUAL_SCALE - worldOffsetX
        const dbMinY = minY * VISUAL_SCALE - worldOffsetY
        const dbMaxY = maxY * VISUAL_SCALE - worldOffsetY

        const localPixelsInBBox = spatialGrid.query(dbMinX, dbMaxX, dbMinY, dbMaxY)
        for (const localPixel of localPixelsInBBox) {
          if (localPixel.coordX >= dbMinX && localPixel.coordX <= dbMaxX &&
              localPixel.coordY >= dbMinY && localPixel.coordY <= dbMaxY) {
            if (!freshUserIds.has(localPixel.pixelId)) {
              // DB에서 실제 삭제된 봇/유저 픽셀 제거
              spatialGrid.remove(localPixel.pixelId)
              hasUpdates = true
            }
          }
        }
      }

      for (const coord of allDbCoords) {
        const userObj = Array.isArray(coord.users) ? coord.users[0] : coord.users
        if (!userObj) continue

        const momentList = Array.isArray(userObj.moments) ? userObj.moments : []
        const momentObj = momentList.find((m: any) => m.is_deleted === false) || null

        let thumbUrl = null
        if (momentObj?.images && Array.isArray(momentObj.images) && momentObj.images.length > 0) {
          thumbUrl = momentObj.images[0].thumbnailUrl
        }

        // ── [SWR REVALIDATE] 기존 픽셀 전체 필드 동기화 ──
        // 배치 알고리즘(진화/중력/군집), 새 가입자, 프로필 변경 등
        // 모든 DB 변경 사항을 즉시 반영.
        const existing = spatialGrid.getPixel(coord.user_id)
        if (existing && !forceInit) {
          let updated = false

          const personaDoc = (Array.isArray(userObj.user_personas) ? userObj.user_personas[0] : userObj.user_personas) || {
            persona_code: 'STARTER', glow_color_primary: '#818CF8', glow_color_secondary: '#C084FC',
          }

          const isMe = coord.user_id === useUserStore.getState().user?.id
          const globalDisplayName = isMe ? (useUserStore.getState().user?.display_name || userObj.display_name) : userObj.display_name
          const freshDisplayName = coord.display_name || globalDisplayName || 'Anonymous'
          const freshAvatarUrl = coord.avatar_image_url || userObj.avatar_image_url

          const latestMoment = momentList.find((m: any) => m.is_deleted === false) || null
          const freshMomentContent = latestMoment?.content || undefined
          let freshMomentThumb = null
          if (latestMoment?.images && Array.isArray(latestMoment.images) && latestMoment.images.length > 0) {
            freshMomentThumb = latestMoment.images[0].thumbnailUrl
          }

          const receivedPings = Array.isArray(userObj.pings) ? userObj.pings : []
          const pingTypes = Array.from(new Set(receivedPings.map((p: any) => p.ping_type as PingId))) as PingId[]

          const bboxGalaxyScores = userObj.galaxy_activity_scores || {}
          const bboxCurrentDomain = useGalaxyStore.getState().galaxyDomain
          const bboxGalaxyEs = Number(bboxGalaxyScores[bboxCurrentDomain] || 0)

          const avatarConfigRaw = userObj.avatar_config
          const avatarConfig = Array.isArray(avatarConfigRaw) ? avatarConfigRaw[0] : avatarConfigRaw

          // ── 좌표 동기화 (배치 알고리즘/중력/진화 반영) ──
          const freshX = coord.coord_x * VISUAL_SCALE - worldOffsetX
          const freshY = coord.coord_y * VISUAL_SCALE - worldOffsetY
          if (Math.abs(existing.coordX - freshX) > 0.01 || Math.abs(existing.coordY - freshY) > 0.01) {
            existing.coordX = freshX
            existing.coordY = freshY
            updated = true
          }

          // ── 프로필 동기화 ──
          if (existing.displayName !== freshDisplayName) { existing.displayName = freshDisplayName; updated = true }
          if (existing.avatarUrl !== freshAvatarUrl) { existing.avatarUrl = freshAvatarUrl; updated = true }
          if (existing.statusMessage !== userObj.status_message) { existing.statusMessage = userObj.status_message; updated = true }

          // ── 모먼트 동기화 ──
          if (existing.momentContent !== freshMomentContent) {
            existing.momentContent = freshMomentContent
            existing.momentThumbnail = freshMomentThumb
            existing.momentId = latestMoment?.id || existing.momentId
            updated = true
          }

          // ── 페르소나/글로우/진화 동기화 ──
          if (existing.personaCode !== personaDoc.persona_code) { existing.personaCode = personaDoc.persona_code; updated = true }
          if (existing.glowColorPrimary !== personaDoc.glow_color_primary) { existing.glowColorPrimary = personaDoc.glow_color_primary; updated = true }
          if (existing.glowColorSecondary !== personaDoc.glow_color_secondary) { existing.glowColorSecondary = personaDoc.glow_color_secondary; updated = true }
          const freshEs = bboxGalaxyEs || Number(userObj.activity_score || 0)
          if (existing.evolutionScore !== freshEs) { existing.evolutionScore = freshEs; updated = true }
          if (existing.moodId !== userObj.current_mood_id) { existing.moodId = userObj.current_mood_id; updated = true }
          if (existing.supernovaTier !== userObj.supernova_tier) { existing.supernovaTier = userObj.supernova_tier; updated = true }
          if (existing.supernovaExpiresAt !== userObj.supernova_expires_at) { existing.supernovaExpiresAt = userObj.supernova_expires_at; updated = true }
          existing.pingCount = receivedPings.length
          existing.pingTypes = pingTypes
          if (existing.zDepth !== (coord.z_depth ?? 1.0)) { existing.zDepth = coord.z_depth ?? 1.0; updated = true }
          const freshSkinCode = avatarConfig?.base_character || undefined
          const freshEquipped = avatarConfig?.equipped_slots as Record<string, string> | undefined
          if (existing.skinCode !== freshSkinCode) { existing.skinCode = freshSkinCode; updated = true }
          existing.equippedSlots = freshEquipped
          if (existing.country !== (userObj.country || 'KR')) { existing.country = userObj.country || 'KR'; updated = true }
          if (existing.rank !== coord.rank) { existing.rank = coord.rank; updated = true }
          // [09-플랜] 매장 픽셀 필드 동기화 (SWR)
          const freshIsStore = userObj.is_store === true
          const freshStoreDetailRaw = userObj.store_detail
          const freshStoreDetail = Array.isArray(freshStoreDetailRaw) ? freshStoreDetailRaw[0] : freshStoreDetailRaw
          const freshStoreRating = (freshIsStore && freshStoreDetail) ? (freshStoreDetail.average_rating ?? 4.0) : undefined
          const freshReviewCount = (freshIsStore && freshStoreDetail) ? (freshStoreDetail.review_count ?? 0) : undefined
          if (existing.isStore !== freshIsStore) { existing.isStore = freshIsStore; updated = true }
          if (existing.storeRating !== freshStoreRating) { existing.storeRating = freshStoreRating; updated = true }
          if (existing.reviewCount !== freshReviewCount) { existing.reviewCount = freshReviewCount; updated = true }

          if (updated) {
            hasUpdates = true
            // 좌표가 바뀐 경우 spatialGrid 셀 재배치
            spatialGrid.upsert(existing)
            const activeSprite = spritePoolRef?.getActiveSprite(coord.user_id)
            if (activeSprite) {
              activeSprite.updateData(existing)
              activeSprite.applyLOD(getLODLevel(camera.viewport.zoom))
            }
          }

          continue  // 기존 픽셀은 in-place 업데이트 완료, newPixels에 추가하지 않음
        }

        const personaDoc = (Array.isArray(userObj.user_personas) ? userObj.user_personas[0] : userObj.user_personas) || {
          persona_code: 'STARTER', glow_color_primary: '#818CF8', glow_color_secondary: '#C084FC',
        }

        const finalPos = {
          x: coord.coord_x * VISUAL_SCALE - worldOffsetX,
          y: coord.coord_y * VISUAL_SCALE - worldOffsetY
        }

        const isMe = coord.user_id === useUserStore.getState().user?.id
        // [FIX] 은하별 닉네임(coord.display_name) 최우선 적용, 없을 경우에만 전역 닉네임 사용
        const globalDisplayName = isMe ? (useUserStore.getState().user?.display_name || userObj.display_name) : userObj.display_name
        const finalDisplayName = coord.display_name || globalDisplayName || 'Anonymous'
        
        // 아바타도 은하별 커스텀 이미지 우선 적용
        const finalAvatarUrl = coord.avatar_image_url || userObj.avatar_image_url

        const receivedPings = Array.isArray(userObj.pings) ? userObj.pings : []
        const pingTypes = Array.from(new Set(receivedPings.map((p: any) => p.ping_type as PingId))) as PingId[]

        const bboxGalaxyScores = userObj.galaxy_activity_scores || {}
        const bboxCurrentDomain = useGalaxyStore.getState().galaxyDomain
        const bboxGalaxyEs = Number(bboxGalaxyScores[bboxCurrentDomain] || 0)

        const avatarConfigRaw = userObj.avatar_config
        const avatarConfig = Array.isArray(avatarConfigRaw) ? avatarConfigRaw[0] : avatarConfigRaw

        // [09-플랜] 매장 픽셀 필드 조립
        const storeDetailRaw = userObj.store_detail
        const storeDetail = Array.isArray(storeDetailRaw) ? storeDetailRaw[0] : storeDetailRaw
        const isStore = userObj.is_store === true
        // average_rating에는 배치에서 계산한 베이지안 최종값이 저장되어 있음 (단순 읽기)
        const storeRating = (isStore && storeDetail) ? (storeDetail.average_rating ?? 4.0) : undefined
        const reviewCount = (isStore && storeDetail) ? (storeDetail.review_count ?? 0) : undefined

        newPixels.push({
          pixelId: coord.user_id, coordX: finalPos.x, coordY: finalPos.y,
          zDepth: coord.z_depth ?? 1.0, glowColorPrimary: personaDoc.glow_color_primary,
          glowColorSecondary: personaDoc.glow_color_secondary, personaCode: personaDoc.persona_code,
          displayName: finalDisplayName, avatarUrl: finalAvatarUrl,
          statusMessage: userObj.status_message, supernovaTier: userObj.supernova_tier,
          supernovaExpiresAt: userObj.supernova_expires_at, momentContent: momentObj?.content,
          momentThumbnail: thumbUrl, pingCount: receivedPings.length, pingTypes,
          momentId: momentObj?.id || undefined,
          evolutionScore: bboxGalaxyEs || Number(userObj.activity_score || 0),
          moodId: userObj.current_mood_id || undefined,
          skinCode: avatarConfig?.base_character || undefined,
          equippedSlots: avatarConfig?.equipped_slots as Record<string, string> | undefined,
          country: userObj.country || 'KR',
          rank: coord.rank,
          isStore,
          storeRating,
          reviewCount,
        })
      }

      // [Session Guard] 데이터 최종 주입 및 스왑 직전, 도메인 전환 세션 유효성 검증
      if (queryDomain !== useGalaxyStore.getState().galaxyDomain) {
        // 통신 도중 은하가 변경되었으므로, 이 응답은 만료된(Stale) 이전 데이터이므로 파기하고 실행 중단
        return
      }

      // [Graceful Swap] 비동기 데이터 로드가 무사히 끝난 시점에 비로소 이전 픽셀 소거를 수행
      if (isDomainSwitching) {
        spatialGrid.clear() // 메모리 소거
        if (spritePoolRef) spritePoolRef.releaseAll() // 즉시 동기적 화면 방출 (잔상 렌더 동결 원천 박멸)
        isDomainSwitching = false
      }

      if (newPixels.length > 0) {
        spatialGrid.insertMany(newPixels)
        newPixels.forEach(p => {
          const activeSprite = spritePoolRef?.getActiveSprite(p.pixelId)
          if (activeSprite) {
            activeSprite.updateData(p)
            activeSprite.applyLOD(getLODLevel(camera.viewport.zoom))
          }
        })
      }

      // ── [SWR] IDB 캐시 갱신 ──
      // 파트너 은하(pixelyf 등): evict가 실행되지 않으므로 매 DB 갱신 후 안전하게 저장
      // 비파트너 은하: evict로 부분 데이터가 될 수 있으므로 forceInit(초기 전체 로드) 시에만 저장
      if ((newPixels.length > 0 || hasUpdates) && forceInit) {
        idbSet(`pixelyf_galaxy_grid_${currentGalaxyDomain}${activeCategory ? "_" + activeCategory : ""}`, spatialGrid.getAll()).catch(console.error)
      }

      window.dispatchEvent(new CustomEvent('bbox-synced'))

      // 메모리 관리: 뷰포트 밖 데이터 제거 (기본 Pixelyf 은하군일 때만)
      if (partnerCode === 'pixelyf') {
        const isGraph = useGalaxyStore.getState().viewMode === 'thoughtGraph'
        const minZoomLimit = isGraph ? 0.15 : 0.03
        const evictPad = ((camera.canvasWidth / 2) / minZoomLimit) * 1.5
        const absoluteX = x + worldOffsetX
        const absoluteY = y + worldOffsetY
        const evictMinX = absoluteX - (camera.canvasWidth / 2) / minZoomLimit - evictPad
        const evictMaxX = absoluteX + (camera.canvasWidth / 2) / minZoomLimit + evictPad
        const evictMinY = absoluteY - (camera.canvasHeight / 2) / minZoomLimit - evictPad
        const evictMaxY = absoluteY + (camera.canvasHeight / 2) / minZoomLimit + evictPad
        spatialGrid.evictOutside(evictMinX, evictMaxX, evictMinY, evictMaxY)

        // [PERF v2] evictOutside로 SpatialGrid에서 제거된 픽셀을
        // SpritePool.hiddenMap에서도 정리 (데이터-스프라이트 불일치 방지)
        if (spritePoolRef) {
          for (const pixelId of Array.from(spritePoolRef.getHiddenIds())) {
            if (!spatialGrid.getPixel(pixelId)) {
              spritePoolRef.removeFromHidden(pixelId)
            }
          }
        }
      }

      // Fetch bonds for all currently loaded pixels
      const currentPixels = spatialGrid.getAll()
      if (newPixels.length > 0) {
        fetchAndStoreBonds(currentPixels) // No await to prevent blocking the BBox fetch cycle
      }

    } finally {
      isFetching = false
      if (pendingFetchArgs) {
        const nextArgs = pendingFetchArgs
        pendingFetchArgs = null
        fetchPixelsInBBox(nextArgs.forceInit, nextArgs.forceBypassThreshold)
      }
    }
  }

  // ─── 디바운스 Fetch ───

  const debouncedFetch = () => {
    const now = Date.now()
    if (now - lastFetchTime > 1000) { // [API OPTIMIZATION] 쓰로틀 임계치 1000ms로 조율
      if (fetchTimeout) clearTimeout(fetchTimeout)
      lastFetchTime = now
      fetchPixelsInBBox(false, true)
      return
    }
    if (fetchTimeout) clearTimeout(fetchTimeout)
    fetchTimeout = setTimeout(() => {
      lastFetchTime = Date.now()
      fetchPixelsInBBox()
    }, 400) // [API OPTIMIZATION] 디바운스 딜레이 400ms로 확장
  }

  // ─── 실시간 채널 구독 ───

  let pingListenerRef: ((e: any) => void) | null = null
  let touchListenerRef: ((e: any) => void) | null = null
  let momentListenerRef: ((e: any) => void) | null = null
  let profileListenerRef: ((e: any) => void) | null = null
  let categorySubUnsub: (() => void) | null = null

  const subscribeChannels = () => {
    const doSubscribe = () => {
      // 이미 구독 중인 채널이 있으면 정리 후 구독
      if (activePulseChannel) {
        supabaseClient.removeChannel(activePulseChannel)
        activePulseChannel = null
      }
      if (activeCoordChannel) {
        supabaseClient.removeChannel(activeCoordChannel)
        activeCoordChannel = null
      }

      activePulseChannel = supabaseClient
        .channel('galaxy-pulse-live')
        .on('broadcast', { event: 'live-session-pulse' }, () => {})
        .subscribe()

      activeCoordChannel = supabaseClient
        .channel('galaxy-pulse')
        .on('broadcast', { event: 'supernova-active' }, (payload: any) => {
          const { receiver_id, tier_id, expires_at } = payload.payload
          const existing = spatialGrid.getPixel(receiver_id)
          if (existing) {
            existing.supernovaTier = tier_id
            existing.supernovaExpiresAt = expires_at
            const activeSprite = spritePoolRef?.getActiveSprite(receiver_id)
            if (activeSprite) activeSprite.updateData(existing)
          }
        })
        .on('broadcast', { event: 'new-moment' }, (payload: any) => {
          const data = payload.payload
          if (!data || !data.user_id || !data.content) return
          const activeCategory = useGalaxyStore.getState().activeCategory
          const eventCategory = data.contentCategory || data.content_category || data.category || null
          if (activeCategory && eventCategory !== activeCategory) return
          const targetPixel = spatialGrid.getPixel(data.user_id)
          if (targetPixel) {
            const thumbnailUrl = data.images?.[0]?.thumbnailUrl || null
            targetPixel.momentContent = data.content
            targetPixel.momentThumbnail = thumbnailUrl || targetPixel.momentThumbnail
            const activeSprite = spritePoolRef?.getActiveSprite(data.user_id)
            if (activeSprite) activeSprite.updateData(targetPixel)
          }
          window.dispatchEvent(new CustomEvent('remote-moment-received', { detail: data }))

          if (data.is_subscriber_only) {
            window.dispatchEvent(new CustomEvent('subscription-core-light', {
              detail: { creatorId: data.user_id }
            }))
          }
        })
        .subscribe()
    }

    const doUnsubscribe = () => {
      if (activePulseChannel) {
        supabaseClient.removeChannel(activePulseChannel)
        activePulseChannel = null
      }
      if (activeCoordChannel) {
        supabaseClient.removeChannel(activeCoordChannel)
        activeCoordChannel = null
      }
    }

    // 초기 구독 시작
    doSubscribe()

    // [REALTIME LEAK PROTECTION] 브라우저 탭 전환 감지 리스너 등록
    visibilityListener = () => {
      if (document.visibilityState === 'hidden') {
        doUnsubscribe()
      } else if (document.visibilityState === 'visible') {
        doSubscribe()
        debouncedFetch() // 탭 복귀 시 데이터 동기화 갭 메움
      }
    }
    document.addEventListener('visibilitychange', visibilityListener)

    const handleFeedUpdate = (e: any) => {
      if (!e.detail?.pixelId || e.detail.field !== 'pings') return
      const { pixelId, pingId, isCancel, delta } = e.detail
      const target = spatialGrid.getPixel(pixelId)
      if (target) {
        if (isCancel) {
          target.pingCount = Math.max(0, (target.pingCount || 0) + delta)
          if (target.pingCount === 0) {
            target.pingTypes = []
          } else if (pingId) {
            target.pingTypes = target.pingTypes?.filter(t => t !== pingId) || []
          }
        } else {
          const newPingTypes = Array.from(new Set([...(target.pingTypes || []), pingId as PingId]))
          target.pingCount = (target.pingCount || 0) + delta
          target.pingTypes = newPingTypes
        }
        const activeSprite = spritePoolRef?.getActiveSprite(pixelId)
        if (activeSprite) activeSprite.updateData(target)
      }
    }
    window.addEventListener('optimistic-feed-update', handleFeedUpdate)

    const handlePixelUpdate = (e: any) => {
      if (!e.detail?.pixelId) return
      const { pixelId, field, delta, moodId, glowColorPrimary, glowColorSecondary } = e.detail
      const target = spatialGrid.getPixel(pixelId)
      if (target) {
        if (field === 'touchCount') {
          target.touchCount = Math.max(0, (target.touchCount || 0) + (delta || 1))
          const activeSprite = spritePoolRef?.getActiveSprite(pixelId)
          if (activeSprite) activeSprite.updateData(target)
        } else if (field === 'mood') {
          const colors = getMoodColors(moodId || DEFAULT_MOOD_ID)
          target.moodId = moodId || target.moodId
          target.glowColorPrimary = glowColorPrimary || colors.primary
          target.glowColorSecondary = glowColorSecondary || colors.secondary
          const activeSprite = spritePoolRef?.getActiveSprite(pixelId)
          if (activeSprite) activeSprite.updateData(target)
        }
      }
    }
    window.addEventListener('pixel-updated', handlePixelUpdate)

    const handleMomentPosted = (e: any) => {
      if (!e.detail?.pixelId) return
      const activeCategory = useGalaxyStore.getState().activeCategory
      const eventCategory = e.detail.contentCategory || e.detail.content_category || e.detail.category || null
      if (activeCategory && eventCategory !== activeCategory) return
      const { pixelId, content, thumbnailUrl, momentId } = e.detail
      const target = spatialGrid.getPixel(pixelId)
      if (target) {
        target.momentContent = content
        target.momentThumbnail = thumbnailUrl || target.momentThumbnail
        target.momentId = momentId || target.momentId
        const activeSprite = spritePoolRef?.getActiveSprite(pixelId)
        if (activeSprite) activeSprite.updateData(target)
      }
    }
    window.addEventListener('moment-posted', handleMomentPosted)

    const handleProfileUpdate = (e: any) => {
      if (!e.detail?.pixelId) return
      const { pixelId, displayName, avatarUrl, statusMessage, skinCode, equippedSlots } = e.detail
      const target = spatialGrid.getPixel(pixelId)
      if (target) {
        if (displayName !== undefined) target.displayName = displayName
        if (avatarUrl !== undefined) target.avatarUrl = avatarUrl
        if (statusMessage !== undefined) target.statusMessage = statusMessage
        if (skinCode !== undefined) target.skinCode = skinCode
        if (equippedSlots !== undefined) target.equippedSlots = equippedSlots
        const activeSprite = spritePoolRef?.getActiveSprite(pixelId)
        if (activeSprite) activeSprite.updateData(target)
      }
    }
    window.addEventListener('profile-updated', handleProfileUpdate)

    pingListenerRef = handleFeedUpdate
    touchListenerRef = handlePixelUpdate
    momentListenerRef = handleMomentPosted
    profileListenerRef = handleProfileUpdate

    return {
      get pulseUnsub() { return activePulseChannel },
      get coordUnsub() { return activeCoordChannel }
    }
  }

  // ─── 은하 전환 ───

  const switchGalaxyDomain = (galaxyKey: string): void => {
    occupiedCells.clear()
    isDomainSwitching = true // 스왑 지연 트리거 활성화
    lastFetchedBBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, zoom: 0 }
    
    // 예약되어 있던 타이머 완전 취소 (Race Condition 소멸)
    if (swrTimeout) {
      clearTimeout(swrTimeout)
      swrTimeout = null
    }
    if (fetchTimeout) {
      clearTimeout(fetchTimeout)
      fetchTimeout = null
    }
    
    // 이전 도메인계의 락 및 대기열 완전 강제 리셋
    isFetching = false
    pendingFetchArgs = null
    
    useGalaxyStore.setState({ galaxyDomain: galaxyKey as GalaxyDomain })
  }

  const fetchGalaxyPixels = async (galaxyKey: string): Promise<void> => {
    if (!supabaseClient || partnerCode !== 'pixelyf') return
    setLoadingStatus('Entering Galaxy Domain...')
    setLoadingProgress(30)
    switchGalaxyDomain(galaxyKey)
    setLoadingProgress(50)
    setLoadingStatus('Awakening Stars...')
    // [BUG FIX] switchGalaxyDomain(clear) 후 실제 DB 쿼리로 데이터 다시 로드.
    // 기존: clear() 직후 getAll() → 항상 0개 → 픽셀 미표시
    await fetchPixelsInBBox(true)
    setLoadingProgress(90)
    const pixelsInView = spatialGrid.getAll()
    await fetchAndStoreBonds(pixelsInView)
    setLoadingProgress(100)
    setVisiblePixels(pixelsInView.length)
  }

  // ─── 정리 ───

  const cleanup = () => {
    if (fetchTimeout) clearTimeout(fetchTimeout)
    if (swrTimeout) {
      clearTimeout(swrTimeout)
      swrTimeout = null
    }
    if (visibilityListener) {
      document.removeEventListener('visibilitychange', visibilityListener)
      visibilityListener = null
    }
    // [REALTIME LEAK PROTECTION] 활성 Supabase 채널 안전 제거
    if (activePulseChannel) {
      supabaseClient.removeChannel(activePulseChannel)
      activePulseChannel = null
    }
    if (activeCoordChannel) {
      supabaseClient.removeChannel(activeCoordChannel)
      activeCoordChannel = null
    }

    if (pingListenerRef) window.removeEventListener('optimistic-feed-update', pingListenerRef)
    if (touchListenerRef) window.removeEventListener('pixel-updated', touchListenerRef)
    if (momentListenerRef) window.removeEventListener('moment-posted', momentListenerRef)
    if (profileListenerRef) window.removeEventListener('profile-updated', profileListenerRef)
    if (categorySubUnsub) categorySubUnsub()
    categorySubUnsub = null
    pingListenerRef = null
    touchListenerRef = null
    momentListenerRef = null
    profileListenerRef = null
  }

  return { fetchPixelsInBBox, fetchGalaxyPixels, switchGalaxyDomain, debouncedFetch, subscribeChannels, cleanup, setSpritePool, fetchBonds: fetchAndStoreBonds, fetchMyBonds, fetchBondsForPixel, fetchMySubscriptionBonds }
}
