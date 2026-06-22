'use client'

/**
 * usePixelFeed — 피드 리스트 로딩, 편집, 삭제, 무한 스크롤, 모먼트 이벤트 동기화
 *
 * [아키텍처] PixelDetailDrawer에서 추출된 도메인 훅.
 * feedMoments, fetchFeedPage, sentinelRef, 편집 상태, moment-posted 이벤트 리스너 포함.
 * setFeedMoments를 DI로 노출하여 usePixelInteractions에서 낙관적 UI 업데이트 가능.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { usePingStore } from '@/stores/pingStore'
import { useToastStore } from '@/stores/toastStore'
import { useTranslations, useLocale } from 'next-intl'
import { useImageUpload } from '@/shared/hooks/useImageUpload'
import { useIntersectionObserver } from '@/shared/hooks/useIntersectionObserver'
import { extractYouTubeId, getYouTubeThumbnail } from '@/shared/utils/youtube'
import { FeedImage, FeedItem } from './SearchFeedDrawer'
import type { PixelData } from './PixelDetailDrawer'

const FEED_LIMIT = 10

interface CacheEntry {
  moments: FeedItem[]
  hasMore: boolean
  page: number
  timestamp: number
}

// 픽셀 피드 글로벌 인메모리 캐시 (SWR 지원)
const feedCache = new Map<string, CacheEntry>()

interface UsePixelFeedParams {
  selectedPixelId: string | null
  pixel: PixelData | null
  isStore?: boolean
  activeTab?: 'moment' | 'community'
}

export function usePixelFeed({ selectedPixelId, pixel, isStore = false, activeTab = 'moment' }: UsePixelFeedParams) {
  const t = useTranslations('Pixel')
  const tM = useTranslations('Moment')
  const locale = useLocale()
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const activeCategory = useGalaxyStore(s => s.activeCategory)
  const addToast = useToastStore(s => s.addToast)

  // ── SWR 캐시 실시간 CUD 동기화 헬퍼 ──
  const updateCacheEntry = useCallback((momentId: string, type: 'edit' | 'delete' | 'post', payload?: any) => {
    const cacheKey = `${galaxyKey || 'INQUE'}_${activeCategory || 'ALL'}_${selectedPixelId}_${isStore ? 'store' : 'user'}_${activeTab || 'moment'}_${locale}`
    const cached = feedCache.get(cacheKey)
    if (!cached) return

    if (type === 'delete') {
      feedCache.set(cacheKey, {
        ...cached,
        moments: cached.moments.filter(m => (m.momentId || m.id) !== momentId)
      })
    } else if (type === 'edit') {
      feedCache.set(cacheKey, {
        ...cached,
        moments: cached.moments.map(m => (m.momentId || m.id) === momentId ? { ...m, ...payload } : m)
      })
    } else if (type === 'post') {
      if (!cached.moments.some(m => (m.momentId || m.id) === momentId)) {
        feedCache.set(cacheKey, {
          ...cached,
          moments: [payload, ...cached.moments]
        })
      }
    }
  }, [galaxyKey, activeCategory, selectedPixelId, locale, isStore, activeTab])

  // ── 피드 리스트 상태 ──
  const [feedMoments, setFeedMoments] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedHasMore, setFeedHasMore] = useState(true)

  // ── 편집 상태 ──
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editPendingFiles, setEditPendingFiles] = useState<File[]>([])
  const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([])
  const [editYoutubeUrl, setEditYoutubeUrl] = useState('')
  const [editExistingImages, setEditExistingImages] = useState<FeedImage[]>([])
  const [editTags, setEditTags] = useState<string[]>([])
  const [kebabOpenId, setKebabOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Refs ──
  const feedPageRef = useRef(0)
  const feedLoadingRef = useRef(false)
  const feedFetchIdRef = useRef(0)

  // ── 이미지 업로드 ──
  const { uploadImages } = useImageUpload({ folder: 'moments', maxSizeMB: 5, maxFiles: 10 })

  // ── 토스트 유틸 ──
  const showToast = useCallback((msg: string) => {
    addToast({ title: t('notification'), message: msg, type: 'info' })
  }, [addToast, t])

  // ── getGalaxyName (위험 5 해결: 훅 내부에서 직접 계산) ──
  const isMaster = pixel?.supernovaTier === 'MASTER'
  const getGalaxyName = useCallback((pixelObj: PixelData | null) => {
    if (!pixelObj?.momentContent) return t('unknownGalaxy')
    if (pixelObj.momentContent.includes('언러닝')) return t('unlearnGalaxy')
    if (pixelObj.momentContent.includes('컨티뉴어스')) return t('continuousGalaxy')
    if (pixelObj.momentContent.includes('인사이드')) return t('insideRoom')
    if (pixelObj.momentContent.includes('구독') || isMaster) return t('subscriptionGalaxy')
    return t('resonatingUniverse')
  }, [isMaster, t])

  // ── 피드 페이지 로딩 ──
  const fetchFeedPage = useCallback(async (page: number, reset = false) => {
    if (!selectedPixelId || (feedLoadingRef.current && !reset)) return
    
    const cacheKey = `${galaxyKey || 'INQUE'}_${activeCategory || 'ALL'}_${selectedPixelId}_${isStore ? 'store' : 'user'}_${activeTab || 'moment'}_${locale}`
    const myFetchId = ++feedFetchIdRef.current
    feedLoadingRef.current = true

    // SWR Phase 1: 캐시가 존재하면 0ms만에 우선 화면 렌더링 (백그라운드에서 Revalidate)
    if (reset && feedCache.has(cacheKey)) {
      const cached = feedCache.get(cacheKey)!
      setFeedMoments(cached.moments)
      setFeedHasMore(cached.hasMore)
      
      const cachedPings: Record<string, string> = {}
      cached.moments.forEach((m: FeedItem) => {
        if (m.my_ping_type) cachedPings[m.momentId || m.id] = m.my_ping_type
      })
      usePingStore.getState().resetMomentPings()
      usePingStore.getState().batchSetMomentPings(cachedPings)
      
      // 스피너는 돌리지 않고, 백그라운드 Revalidation 중임을 ref로만 잠금
      setFeedLoading(false)
    } else {
      setFeedLoading(true)
    }

    try {
      let res: Response

      // ── 일반 은하: 기존 moments API ──
      let url = `/api/moments?page=${page}&limit=${FEED_LIMIT}&lang=${locale}`
      if (activeTab === 'community') {
        url += `&targetPixelId=${selectedPixelId}`
      } else {
        url += `&userId=${selectedPixelId}`
      }
      if (activeCategory) {
        url += `&category=${activeCategory}`
      } else if (galaxyKey) {
        url += `&galaxy=${galaxyKey}`
      }
      res = await fetch(url)

      const data = await res.json()
      if (myFetchId !== feedFetchIdRef.current) return // 스테일 응답 무시

      const dataMoments = data.data || data.moments || []
      const newPings: Record<string, string> = {}
      dataMoments.forEach((m: FeedItem) => {
        if (m.my_ping_type) newPings[m.momentId || m.id] = m.my_ping_type
      })

      if (reset) {
        setFeedMoments(dataMoments)
        usePingStore.getState().resetMomentPings()
        usePingStore.getState().batchSetMomentPings(newPings)

        // SWR Phase 2: 로드 완료된 최신 데이터로 캐시 갱신
        feedCache.set(cacheKey, {
          moments: dataMoments,
          hasMore: data.hasMore ?? false,
          page: 0,
          timestamp: Date.now()
        })
      } else {
        setFeedMoments(prev => {
          const next = [...prev, ...dataMoments]
          // 페이지네이션 캐시 누적 업데이트
          feedCache.set(cacheKey, {
            moments: next,
            hasMore: data.hasMore ?? false,
            page: page,
            timestamp: Date.now()
          })
          return next
        })
        usePingStore.getState().batchSetMomentPings(newPings)
      }
      setFeedHasMore(data.hasMore ?? false)
    } catch (e) {
      console.error('[Feed] Load Error:', e)
    } finally {
      if (myFetchId === feedFetchIdRef.current) {
        feedLoadingRef.current = false
        setFeedLoading(false)
      }
    }
  }, [selectedPixelId, galaxyKey, activeCategory, locale, isStore, activeTab])

  // ── 무한 스크롤 감지 ──
  const { sentinelRef } = useIntersectionObserver({
    onIntersect: () => {
      if (feedLoadingRef.current) return
      feedPageRef.current += 1
      fetchFeedPage(feedPageRef.current)
    },
    enabled: feedHasMore && !feedLoading,
  })

  useEffect(() => {
    const handleMomentPosted = (e: Event) => {
      const customEvent = e as CustomEvent
      if (!customEvent.detail || !selectedPixelId) return
      const { pixelId, targetPixelId, momentId, content, category, contentCategory, images, youtubeUrl, createdAt, pingCount: mPingCount, pingTypeCounts, authorDisplayName, authorAvatarUrl, contentTags } = customEvent.detail
      const categoryKey = contentCategory || category || null
      
      const isForCurrentPixel = (targetPixelId && targetPixelId === selectedPixelId) || (!targetPixelId && pixelId === selectedPixelId)
      if (!isForCurrentPixel) return

      // 탭 필터링 검증: 커뮤니티 이벤트와 현재 탭 일치 여부 판별
      const isCommunityEvent = !!targetPixelId
      const isCommunityTab = activeTab === 'community'
      if (isCommunityEvent !== isCommunityTab) return
      if (activeCategory && categoryKey !== activeCategory) return

      setFeedMoments(prev => {
        if (prev.some(m => (m.momentId || m.id) === momentId)) return prev
        const newMoment = {
          id: momentId,
          content,
          images: images || [],
          youtubeUrl: youtubeUrl || null,
          created_at: createdAt,
          is_deleted: false,
          ping_count: mPingCount || 0,
          ping_type_counts: pingTypeCounts || {},
          author: pixel?.displayName || '',
          badge: null,
          days: 0,
          galaxyLabel: categoryKey || getGalaxyName(pixel),
          categoryId: categoryKey || galaxyKey || 'PIXELYF',
          pings: 0,
          pingTypeCounts: pingTypeCounts || {},
          commentCount: 0,
          coord: { x: 0, y: 0, z: 0 },
          content_tags: contentTags || [],
          authorProfile: targetPixelId ? {
            displayName: authorDisplayName || '익명',
            avatarUrl: authorAvatarUrl || null
          } : null
        } as FeedItem
        
        // 캐시에도 동시 이식
        updateCacheEntry(momentId, 'post', newMoment)

        return [newMoment, ...prev]
      })
    }

    window.addEventListener('moment-posted', handleMomentPosted)
    return () => window.removeEventListener('moment-posted', handleMomentPosted)
  }, [selectedPixelId, galaxyKey, activeCategory, getGalaxyName, pixel, updateCacheEntry, activeTab])

  // ── 모먼트 수정 핸들러 ──
  const handleEditMoment = async (momentId: string) => {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed.length > 140) return

    try {
      let newUploadedImages: FeedImage[] = []
      if (editPendingFiles.length > 0) {
        newUploadedImages = await uploadImages(editPendingFiles) as unknown as FeedImage[]
      }
      const finalImages = [...editExistingImages, ...newUploadedImages].slice(0, 10)

      const res = await fetch(`/api/moments/${momentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmed,
          images: finalImages.length > 0 ? finalImages : null,
          youtubeUrl: editYoutubeUrl.trim() || null,
          contentTags: editTags,
        })
      })
      if (res.ok) {
        let updatedImages = finalImages.length > 0 ? finalImages : undefined;
        const yUrl = editYoutubeUrl.trim() || null;
        if (yUrl) {
          const yId = extractYouTubeId(yUrl);
          if (yId) {
            const yImg = { url: yUrl, thumbnailUrl: getYouTubeThumbnail(yId), youtubeUrl: yUrl };
            updatedImages = updatedImages ? [yImg, ...updatedImages.filter(i => !i.youtubeUrl)] : [yImg];
          }
        } else if (updatedImages) {
          updatedImages = updatedImages.filter(i => !i.youtubeUrl);
          if (updatedImages.length === 0) updatedImages = undefined;
        }

        // SWR 캐시 동시 업데이트
        updateCacheEntry(momentId, 'edit', { content: trimmed, images: updatedImages, youtubeUrl: yUrl, content_tags: editTags })

        // 실시간 피드 업데이트 이벤트 발행 (검색 판넬 등의 실시간 갱신을 보장)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('optimistic-feed-update', {
              detail: {
                momentId,
                field: 'edit',
                content: trimmed,
                images: updatedImages,
                youtubeUrl: yUrl,
                contentTags: editTags,
              },
            })
          )
        }

        setFeedMoments(prev => prev.map(m => {
          if ((m.momentId || m.id) === momentId) {
            return { ...m, content: trimmed, images: updatedImages, youtubeUrl: yUrl, content_tags: editTags };
          }
          return m;
        }))
        editPreviewUrls.forEach(url => URL.revokeObjectURL(url))
        setEditPendingFiles([])
        setEditPreviewUrls([])
        setEditYoutubeUrl('')
        setEditExistingImages([])
        setEditTags([])
        setEditingMomentId(null)
        setEditContent('')
      } else {
        showToast(t('editFailed'))
        console.error('[Edit] API Error:', await res.json())
      }
    } catch (e: any) {
      showToast(e?.message || t('editNetworkFailed'))
      console.error('[Edit] Network Error:', e)
    }
  }

  // ── 모먼트 삭제 핸들러 ──
  const handleDeleteMoment = async (momentId: string) => {
    try {
      const res = await fetch(`/api/moments/${momentId}`, { method: 'DELETE' })
      if (res.ok) {
        // SWR 캐시 동시 삭제
        updateCacheEntry(momentId, 'delete')

        // 전역 Spotlight 상태 초기화 (삭제된 모먼트가 Spotlight 대상인 경우)
        const target = useGalaxyStore.getState().targetFeedItem
        if (target && (target.momentId || target.id) === momentId) {
          useGalaxyStore.getState().setTargetFeedItem(null)
        }

        setFeedMoments(prev => prev.filter(m => (m.momentId || m.id) !== momentId))
        setKebabOpenId(null)
        setConfirmDeleteId(null)
        window.dispatchEvent(new CustomEvent('moment-deleted', { detail: { momentId } }))
      } else {
        showToast(t('deleteFailed'))
        setConfirmDeleteId(null)
        console.error('[Delete] API Error:', await res.text())
      }
    } catch (e) {
      showToast(t('deleteNetworkFailed'))
      setConfirmDeleteId(null)
      console.error('[Delete] Network Error:', e)
    }
  }

  // ── resetOnPixelChange (위험 4 해결: 통합 초기화 useEffect에서 호출) ──
  const resetOnPixelChange = useCallback(() => {
    feedLoadingRef.current = false
    feedPageRef.current = 0
    setFeedMoments([])
    setFeedHasMore(true)
    setEditingMomentId(null)
    editPreviewUrls.forEach(url => URL.revokeObjectURL(url))
    setEditPendingFiles([])
    setEditPreviewUrls([])
    setEditExistingImages([])
    setEditTags([])
    setKebabOpenId(null)
    fetchFeedPage(0, true)
  }, [fetchFeedPage, editPreviewUrls])

  // ── isStore 변경 시 피드 리셋 ──
  const prevIsStoreRef = useRef(isStore)
  useEffect(() => {
    if (prevIsStoreRef.current !== isStore) {
      prevIsStoreRef.current = isStore
      resetOnPixelChange()
    }
  }, [isStore, resetOnPixelChange])

  // ── activeTab 변경 시 피드 리셋 ──
  const prevActiveTabRef = useRef(activeTab)
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab
      resetOnPixelChange()
    }
  }, [activeTab, resetOnPixelChange])

  return {
    // 피드 상태
    feedMoments,
    setFeedMoments,  // DI: usePixelInteractions에서 낙관적 UI 업데이트용
    feedLoading,
    feedHasMore,
    sentinelRef,

    // 편집 상태
    editingMomentId,
    setEditingMomentId,
    editContent,
    setEditContent,
    editPendingFiles,
    setEditPendingFiles,
    editPreviewUrls,
    setEditPreviewUrls,
    editYoutubeUrl,
    setEditYoutubeUrl,
    editExistingImages,
    setEditExistingImages,
    editTags,
    setEditTags,
    kebabOpenId,
    setKebabOpenId,
    confirmDeleteId,
    setConfirmDeleteId,

    // 유틸
    uploadImages,
    showToast,
    getGalaxyName,
    isMaster,
    isLockedContent: isMaster && !(false), // isCreatorAuthed는 본체에서 계산

    // 핸들러
    handleEditMoment,
    handleDeleteMoment,
    fetchFeedPage,
    resetOnPixelChange,
  }
}
