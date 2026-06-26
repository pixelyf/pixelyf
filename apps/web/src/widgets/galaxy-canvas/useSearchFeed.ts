'use client'

/**
 * useSearchFeed — SearchFeedDrawer의 피드 로딩/이벤트/네비게이션 로직
 *
 * [아키텍처] SearchFeedDrawer에서 추출된 도메인 훅.
 * - fetchFeeds: 전역/검색 피드 API 호출 (캐시 포함)
 * - 실시간 이벤트: moment-posted, remote-moment-received, pixel-updated, moment-deleted
 * - handleFeedClick: 피드 클릭 시 카메라 포커스 + 픽셀 선택
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { CAMERA_ZOOM } from '@/shared/constants/camera'
import { useLocale } from 'next-intl'
import type { FeedItem, FeedTab } from './SearchFeedDrawer'

const SEARCH_LIMIT = 15

interface UseSearchFeedParams {
  activeTab: FeedTab
  feedScope: 'global' | 'bonds'
  searchMode: 'content' | 'nickname'
  debouncedSearchTerm: string
  isCollapsed: boolean
  dynamicLabelMap: Record<string, string>
  feedType?: 'moment' | 'community'
}

export function useSearchFeed({
  activeTab,
  feedScope,
  searchMode,
  debouncedSearchTerm,
  isCollapsed,
  dynamicLabelMap,
  feedType,
}: UseSearchFeedParams) {
  const locale = useLocale()
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const activeCategory = useGalaxyStore(s => s.activeCategory)
  const selectPixel = useGalaxyStore(s => s.selectPixel)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const mobileViewMode = useGalaxyStore(s => s.mobileViewMode)
  const isInactive = isMobile ? mobileViewMode !== 'feed' : isCollapsed

  // ── 피드 상태 ──
  const [feeds, setFeeds] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef(false)
  const feedFetchIdRef = useRef(0)
  const feedCacheRef = useRef<Record<string, FeedItem[]>>({})

  // ── 무한 스크롤 ──
  const { sentinelRef } = useIntersectionObserver({
    onIntersect: () => {
      if (loadingRef.current) return
      const nextPage = page + 1
      setPage(nextPage)
      fetchFeeds(nextPage, false, debouncedSearchTerm)
    },
    enabled: hasMore && !loading && !isInactive && feeds.length > 0,
  })

  // ── fetchFeeds ──
  const fetchFeeds = useCallback(async (pageNum = 0, reset = false, currentSearchTerm = debouncedSearchTerm) => {
    if (loadingRef.current && !reset) return

    const cacheKey = `${activeTab}-${feedScope}-${searchMode}-${currentSearchTerm.trim()}-${galaxyKey}-${activeCategory}-${feedType || 'moment'}`
    let hasCache = false

    if (reset && feedCacheRef.current[cacheKey]) {
      const cachedFeeds = feedCacheRef.current[cacheKey]
      setFeeds(cachedFeeds)
      setPage(Math.max(0, Math.ceil(cachedFeeds.length / SEARCH_LIMIT) - 1))
      setHasMore(cachedFeeds.length % SEARCH_LIMIT === 0 && cachedFeeds.length > 0)
      hasCache = true
      // SWR: 캐시 데이터를 즉시 렌더링 한 뒤, return 하지 않고 백그라운드에서 Revalidate(fetch) 연쇄 수행!
    }

    const myFetchId = ++feedFetchIdRef.current
    loadingRef.current = true

    // 캐시가 존재할 경우에는 로딩 스피너를 띄우지 않고 백그라운드 조용히 로드
    if (!hasCache) {
      setLoading(true)
    }

    try {
      let res: Response

      const params = new URLSearchParams()
      params.append('tab', activeTab)
      params.append('scope', feedScope)
      params.append('mode', searchMode)
      if (currentSearchTerm.trim()) params.append('q', currentSearchTerm.trim())
      if (galaxyKey) params.append('galaxy', galaxyKey)
      if (activeCategory) params.append('category', activeCategory)
      if (feedType) params.append('feedType', feedType)
      params.append('page', pageNum.toString())
      params.append('limit', SEARCH_LIMIT.toString())
      params.append('lang', locale)
      res = await fetch(`/api/feeds/search?${params.toString()}`)

      const json = await res.json()
      if (myFetchId !== feedFetchIdRef.current) return

      if (res.ok && json.data) {
        const mapped: FeedItem[] = json.data
        if (reset) {
          setFeeds(mapped)
          feedCacheRef.current[cacheKey] = mapped
        } else {
          setFeeds(prev => {
            const newFeeds = [...prev, ...mapped]
            feedCacheRef.current[cacheKey] = newFeeds
            return newFeeds
          })
        }
        setHasMore(json.hasMore)
      } else {
        console.error('API Error:', json.error)
        setHasMore(false)
      }
    } catch (err) {
      console.error('Fetch Feeds Error:', err)
      setHasMore(false)
    } finally {
      if (myFetchId === feedFetchIdRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [activeTab, searchMode, galaxyKey, activeCategory, feedScope, locale, feedType])

  // ── 피드 페치 트리거 ──
  const prevSearchModeRef = useRef(searchMode)

  useEffect(() => {
    if (isInactive) return
    if (!debouncedSearchTerm.trim() && prevSearchModeRef.current !== searchMode) {
      prevSearchModeRef.current = searchMode
      return
    }
    prevSearchModeRef.current = searchMode
    setPage(0)
    setHasMore(true)
    setFeeds([])
    fetchFeeds(0, true, debouncedSearchTerm)
  }, [isInactive, debouncedSearchTerm, searchMode, feedType, fetchFeeds])

  // ── 실시간 이벤트 구독 ──
  useEffect(() => {
    if (isInactive) return

    const prependFeed = (
      userId: string,
      momentId: string,
      content: string,
      category: string,
      displayName: string,
      badge: string | null,
      coord: { x: number; y: number },
      images?: any[] | null,
      youtubeUrl?: string | null,
      avatarUrl?: string,
      createdAt?: string | null,
      targetPixelId?: string | null,
      targetPixelCoord?: { x: number; y: number; z?: number } | null,
      isStore?: boolean,
      storeRating?: number,
      reviewCount?: number,
      personaCode?: string
    ) => {
      // 피드 탭 필터링 검증
      const isCommunityEvent = !!targetPixelId
      const isCommunityFeedTab = feedType === 'community'
      if (isCommunityEvent !== isCommunityFeedTab) return
      if (activeCategory && category !== activeCategory) return

      feedCacheRef.current = {} // 모먼트 생성 시 캐시 무효화
      setFeeds(prev => {
        if (prev.length > 0 && prev[0].id === userId && prev[0].content === content) return prev
        const newFeed = {
          id: userId,
          momentId,
          author: displayName || '',
          badge,
          days: 0,
          galaxyLabel: dynamicLabelMap[category] || category,
          categoryId: category,
          content,
          images: images || [],
          youtubeUrl: youtubeUrl || null,
          avatarUrl: avatarUrl || undefined,
          createdAt: createdAt || new Date().toISOString(),
          created_at: createdAt || new Date().toISOString(),
          pings: 0,
          pingTypeCounts: {},
          commentCount: 0,
          coord: { x: coord.x || 0, y: coord.y || 0, z: 1 },
          momentContent: content,
          targetPixelId,
          targetPixelCoord,
          isStore,
          storeRating,
          reviewCount,
          personaCode,
        }
        return [newFeed, ...prev]
      })
    }

    const handleLocalMoment = (e: Event) => {
      const customEvent = e as CustomEvent
      if (!customEvent.detail) return
      const { pixelId, targetPixelId, targetPixelCoord, momentId, content, category, contentCategory, images, youtubeUrl, createdAt } = customEvent.detail
      const categoryKey = contentCategory || category
      const spatialGrid = useGalaxyStore.getState().spatialGrid
      const pixelData = spatialGrid?.getPixel(pixelId)
      if (!pixelData) return
      prependFeed(
        pixelId,
        momentId,
        content,
        categoryKey,
        pixelData.displayName || '',
        pixelData.supernovaTier === 'MASTER' ? '👑 MASTER' : null,
        { x: pixelData.coordX || 0, y: pixelData.coordY || 0 },
        images,
        youtubeUrl,
        pixelData.avatarUrl || undefined,
        createdAt || new Date().toISOString(),
        targetPixelId,
        targetPixelCoord,
        pixelData.isStore,
        pixelData.storeRating,
        pixelData.reviewCount,
        pixelData.personaCode
      )
    }
    window.addEventListener('moment-posted', handleLocalMoment)

    const handleRemoteMoment = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (!data || !data.user_id || !data.content) return
      const category = data.contentCategory || data.content_category || data.category || 'mood'
      const spatialGrid = useGalaxyStore.getState().spatialGrid
      const pixelData = spatialGrid?.getPixel(data.user_id)

      const isStore = data.user?.is_store ?? pixelData?.isStore
      const storeRating = data.user?.store_detail?.average_rating ?? pixelData?.storeRating
      const reviewCount = data.user?.store_detail?.review_count ?? pixelData?.reviewCount
      const personaCode = data.user?.persona?.persona_code ?? pixelData?.personaCode

      prependFeed(
        data.user_id,
        data.id, // momentId
        data.content,
        category,
        data.user?.display_name || '',
        data.user?.supernova_tier === 'MASTER' ? '👑 MASTER' : null,
        { x: data.coord?.x || 0, y: data.coord?.y || 0 },
        data.images,
        data.youtubeUrl,
        data.user?.avatar_url || data.user?.avatarUrl || undefined,
        data.created_at || data.createdAt || new Date().toISOString(),
        data.targetPixelId,
        data.targetPixelCoord,
        isStore,
        storeRating,
        reviewCount,
        personaCode
      )
    }
    window.addEventListener('remote-moment-received', handleRemoteMoment)

    const handlePixelUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const pixelId = detail?.pixelId
      if (!pixelId) return
      const spatialGrid = useGalaxyStore.getState().spatialGrid
      if (!spatialGrid) return
      const pixelData = spatialGrid.getPixel(pixelId)
      if (!pixelData) return
      setFeeds(prev => prev.map(f => {
        if (f.id === pixelId) {
          return {
            ...f,
            moodId: detail?.moodId ?? pixelData.moodId ?? f.moodId,
            glowPrimary: detail?.glowColorPrimary ?? pixelData.glowColorPrimary ?? f.glowPrimary,
            glowSecondary: detail?.glowColorSecondary ?? pixelData.glowColorSecondary ?? f.glowSecondary,
            author: pixelData.displayName ?? f.author,
          }
        }
        return f
      }))
    }
    window.addEventListener('pixel-updated', handlePixelUpdated)
    window.addEventListener('profile-updated', handlePixelUpdated)

    const handleMomentDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.momentId) {
        feedCacheRef.current = {} // 모먼트 삭제 시 캐시 무효화
        setFeeds(prev => prev.filter(f => f.momentId !== detail.momentId))
      }
    }
    window.addEventListener('moment-deleted', handleMomentDeleted)

    const handleFeedUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail || !detail.momentId || !detail.field) return
      const { momentId, field, delta, pingId, isCancel, pingTypeCounts } = detail

      setFeeds(prev => prev.map(f => {
        if (f.momentId === momentId) {
          if (field === 'edit') {
            return {
              ...f,
              content: detail.content !== undefined ? detail.content : f.content,
              momentContent: detail.content !== undefined ? detail.content : f.momentContent,
              images: detail.images !== undefined ? detail.images : f.images,
              youtubeUrl: detail.youtubeUrl !== undefined ? detail.youtubeUrl : f.youtubeUrl,
              contentTags: detail.contentTags !== undefined ? detail.contentTags : (f.contentTags || f.content_tags || []),
              content_tags: detail.contentTags !== undefined ? detail.contentTags : (f.content_tags || f.contentTags || []),
            }
          }
          const updateObj: Record<string, any> = {}
          if (field === 'pings') {
            const currentCounts = { ...(f.pingTypeCounts || {}) }
            if (pingTypeCounts) {
              updateObj.pingTypeCounts = pingTypeCounts
            } else if (pingId) {
              if (isCancel) {
                if (currentCounts[pingId] > 0) currentCounts[pingId] -= 1
              } else {
                currentCounts[pingId] = (currentCounts[pingId] || 0) + 1
              }
              updateObj.pingTypeCounts = currentCounts
            }
          }

          const mainField = field
          const aliasField = field === 'commentCount' ? 'comment_count' : 'ping_count'
          const fAny = f as any

          return {
            ...f,
            [mainField]: Math.max(0, ((fAny[mainField] as number) || 0) + delta),
            [aliasField]: Math.max(0, ((fAny[aliasField] as number) || 0) + delta),
            ...updateObj
          }
        }
        return f
      }))
    }
    window.addEventListener('optimistic-feed-update', handleFeedUpdate)

    return () => {
      window.removeEventListener('moment-posted', handleLocalMoment)
      window.removeEventListener('remote-moment-received', handleRemoteMoment)
      window.removeEventListener('pixel-updated', handlePixelUpdated)
      window.removeEventListener('profile-updated', handlePixelUpdated)
      window.removeEventListener('moment-deleted', handleMomentDeleted)
      window.removeEventListener('optimistic-feed-update', handleFeedUpdate)
    }
  }, [isInactive, dynamicLabelMap, feedType, activeCategory])

  const handleFeedClick = useCallback((feed: FeedItem) => {
    const spatialGrid = useGalaxyStore.getState().spatialGrid;
    const targetId = feed.targetPixelId || feed.id;
    const isBypass = !!feed.targetPixelId;
    const targetCoord = isBypass && feed.targetPixelCoord ? feed.targetPixelCoord : feed.coord;

    if (!spatialGrid) {
      useGalaxyStore.getState().setPreloadedPixelData({
        pixelId: targetId,
        coordX: 0,
        coordY: 0,
        displayName: isBypass ? '매장' : feed.author,
        country: feed.country,
        personaCode: isBypass ? undefined : feed.personaCode,
        supernovaTier: isBypass ? 'MASTER' : (feed.badge ? feed.badge.replace('👑 ', '') : undefined),
        momentContent: isBypass ? undefined : feed.content,
        moodId: isBypass ? 'neutral' : feed.moodId,
        pingCount: isBypass ? 0 : feed.pings,
        glowColorPrimary: '#818CF8',
        glowColorSecondary: '#C084FC',
      })
      selectPixel(targetId);
      useGalaxyStore.getState().setTargetFeedItem(feed);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.set('feed', feed.momentId || feed.id)
        url.searchParams.delete('pixel')
        window.history.pushState({}, '', url.toString())
      }
      return;
    }

    const existingPixel = spatialGrid.getPixel(targetId);
    let targetX: number;
    let targetY: number;

    if (existingPixel && existingPixel.coordX !== undefined) {
      targetX = existingPixel.coordX;
      targetY = existingPixel.coordY;
    } else {
      targetX = targetCoord.x * VISUAL_SCALE;
      targetY = targetCoord.y * VISUAL_SCALE;
      const placeholder = {
        pixelId: targetId,
        coordX: targetX,
        coordY: targetY,
        zDepth: targetCoord.z || 1,
        displayName: isBypass ? '매장' : feed.author,
        supernovaTier: isBypass ? 'MASTER' : (feed.badge ? feed.badge.replace('👑 ', '') : undefined),
        glowColorPrimary: '#818CF8',
        glowColorSecondary: '#C084FC',
        pingCount: isBypass ? 0 : feed.pings,
        momentContent: isBypass ? undefined : feed.content,
        moodId: isBypass ? 'neutral' : feed.moodId,
      } as any;
      spatialGrid.upsert(placeholder);
    }

    useGalaxyStore.getState().focusOnPosition(targetX, targetY, CAMERA_ZOOM.PIXEL_FOCUS, true)
    selectPixel(targetId);
    useGalaxyStore.getState().setTargetFeedItem(feed);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('feed', feed.momentId || feed.id)
      url.searchParams.delete('pixel')
      window.history.pushState({}, '', url.toString())
    }
  }, [selectPixel])

  return {
    feeds,
    setFeeds,
    loading,
    hasMore,
    page,
    setPage,
    sentinelRef,
    fetchFeeds,
    handleFeedClick,
  }
}
