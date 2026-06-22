'use client'

/**
 * usePixelData — 픽셀 데이터 로딩, 연결(bonds), 방문 통계, SEO 타이틀 관리
 *
 * [아키텍처] PixelDetailDrawer에서 추출된 도메인 훅.
 * SpatialGrid/preloadedPixelData에서 pixel 객체를 조회하고,
 * window 이벤트(bbox-synced, pixel-updated 등)를 통해 실시간 갱신.
 */

import { useState, useEffect, useRef } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useTranslations } from 'next-intl'
import { createClient } from '@/shared/lib/supabase/browser'
import { getCachedBonds, saveBondsToCache } from '@/shared/lib/bondsCache'
import type { ConstellationBond } from '@/stores/galaxyStore'

// PixelDetailDrawer에서 export된 로컬 PixelData 타입 재사용
import type { PixelData, VisitStats } from './PixelDetailDrawer'

export interface ConnectedPixel {
  id: string
  name: string
  glowColor: string
  avatarUrl?: string
  statusMessage?: string
  personaCode?: string
  coordX?: number
  coordY?: number
  isStore?: boolean
  storeRating?: number
  reviewCount?: number
}

interface UsePixelDataParams {
  selectedPixelId: string | null
}

export function usePixelData({ selectedPixelId }: UsePixelDataParams) {
  const t = useTranslations('Pixel')
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const spatialGrid = useGalaxyStore(s => s.spatialGrid)
  const preloadedPixelData = useGalaxyStore(s => s.preloadedPixelData)

  // ── Pixel 데이터 ──
  const [pixel, setPixel] = useState<PixelData | null>(null)

  // ── 연결(bonds) ──
  const [bondsLoading, setBondsLoading] = useState(false)
  const [isBondsOpen, setIsBondsOpen] = useState(false)
  const [localConnectedPixels, setLocalConnectedPixels] = useState<ConnectedPixel[]>([])

  // ── 방문 통계 ──
  const [visitStats, setVisitStats] = useState<VisitStats | null>(null)

  // ── Pixel 데이터 로드 + 실시간 갱신 (window events) ──
  useEffect(() => {
    const store = useGalaxyStore.getState()
    const grid = store.spatialGrid
    const preloaded = store.preloadedPixelData

    // [FIX] selectedPixelId가 변경되는 즉시 이전 픽셀 데이터를 비워 visual deadlock 원천 차단
    setPixel(null)
    setVisitStats(null)

    // 1순위: 모바일/캔버스 미렌더링 상태에서 넘겨받은 preloaded 데이터 우선 적용
    if (preloaded && preloaded.pixelId === selectedPixelId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPixel({ ...preloaded } as unknown as PixelData) // 얕은 복사로 새로운 참조 주입
    }
    // 2순위: 데스크탑/캔버스 렌더링 상태에서 엔진 내부의 데이터 읽어오기
    else if (selectedPixelId && grid) {
      const found = grid.getPixel(selectedPixelId)
      if (found) {
        setPixel({ ...found } as unknown as PixelData) // 얕은 복사로 React 18 상태 업데이트 보장
      }
    }

    if (!selectedPixelId) {
      setPixel(null)
    }

    // [FIX] 카메라가 이동한 후 dataSync가 픽셀을 채워넣었을 때 판넬이 열리지 않는 레이스 컨디션 해결
    const handleBBoxSync = () => {
      const grid = useGalaxyStore.getState().spatialGrid
      if (selectedPixelId && grid) {
        const freshPixel = grid.getPixel(selectedPixelId)
        if (freshPixel && freshPixel.pixelId === selectedPixelId) {
          setPixel({ ...freshPixel } as PixelData)
        }
      }
    }
    window.addEventListener('bbox-synced', handleBBoxSync)

    // [REALTIME] 프로필 편집 후 패널 실시간 갱신
    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.pixelId === selectedPixelId) {
        setPixel((prev) => prev ? {
          ...prev,
          displayName: detail.displayName ?? prev.displayName,
          avatarUrl: detail.avatarUrl ?? prev.avatarUrl,
          statusMessage: detail.statusMessage ?? prev.statusMessage,
        } : prev)
      }
    }

    const handleUpdate = () => {
      const grid = useGalaxyStore.getState().spatialGrid
      if (selectedPixelId && grid) {
        const freshPixel = grid.getPixel(selectedPixelId)
        if (freshPixel) setPixel({ ...freshPixel } as PixelData)
      }
    }

    window.addEventListener('pixel-updated', handleUpdate)
    window.addEventListener('optimistic-feed-update', handleUpdate)
    window.addEventListener('remote-moment-received', handleUpdate)
    window.addEventListener('moment-posted', handleUpdate)
    window.addEventListener('profile-updated', handleProfileUpdate)

    return () => {
      window.removeEventListener('pixel-updated', handleUpdate)
      window.removeEventListener('bbox-synced', handleBBoxSync)
      window.removeEventListener('optimistic-feed-update', handleUpdate)
      window.removeEventListener('remote-moment-received', handleUpdate)
      window.removeEventListener('moment-posted', handleUpdate)
      window.removeEventListener('profile-updated', handleProfileUpdate)
    }
  }, [selectedPixelId, spatialGrid, preloadedPixelData])

  // ── 핑 카운트 동기화 (BBox → pixel.pingCount 변경 시) ──
  // [FIX Bug1] 핑 카운트 동기화 전용 — 피드 리셋 없이 카운트만 갱신
  // → 이 값은 interactions 훅에서 사용하므로 pixel.pingCount로 전달

  // ── 연결(bonds) 로드 ──
  useEffect(() => {
    if (!selectedPixelId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalConnectedPixels([])
      return
    }

    let isMounted = true
    setBondsLoading(true)

    const existingBonds = useGalaxyStore.getState().bonds.filter(
      b => b.user_a_id === selectedPixelId || b.user_b_id === selectedPixelId
    )
    const spatialGrid = useGalaxyStore.getState().spatialGrid

    const mapBonds = (bondsArray: ConstellationBond[]) => bondsArray.map((b) => {
      const partnerId = b.user_a_id === selectedPixelId ? b.user_b_id : b.user_a_id
      const partnerPixel = spatialGrid?.getPixel(partnerId)
      return {
        id: partnerId,
        name: partnerPixel?.displayName || t('anonymousPixeler'),
        glowColor: partnerPixel?.glowColorPrimary || '#818CF8',
        avatarUrl: partnerPixel?.avatarUrl,
        statusMessage: partnerPixel?.statusMessage,
        personaCode: partnerPixel?.personaCode,
        coordX: partnerPixel?.coordX,
        coordY: partnerPixel?.coordY,
        isStore: partnerPixel?.isStore,
        storeRating: partnerPixel?.storeRating,
        reviewCount: partnerPixel?.reviewCount,
      }
    })

    if (existingBonds.length > 0) {
      setLocalConnectedPixels(mapBonds(existingBonds))
    }

    const fetchBonds = async () => {
      try {
        // [SWR Phase 1 — Stale] IDB 캐시 즉시 반영 (0ms 로딩)
        const cached = await getCachedBonds(selectedPixelId)
        if (cached.length > 0 && isMounted) {
          setLocalConnectedPixels(mapBonds(cached))
        }

        // [SWR Phase 2 — Revalidate] 네트워크에서 최신 데이터
        const supabase = createClient()
        const { data } = await supabase
          .from('constellation_bonds')
          .select('id, user_a_id, user_b_id, status')
          .or(`user_a_id.eq.${selectedPixelId},user_b_id.eq.${selectedPixelId}`)
          .eq('status', 'accepted')

        if (!isMounted) return

        if (data) {
          setLocalConnectedPixels(mapBonds(data))
          if (data.length > 0) {
            saveBondsToCache(selectedPixelId, data).catch(console.error)
          }
        }
      } catch (err) {
        console.error('Failed to fetch bonds', err)
      } finally {
        if (isMounted) {
          setBondsLoading(false)
        }
      }
    }

    fetchBonds()

    return () => {
      isMounted = false
    }
  }, [selectedPixelId])

  // ── SEO 타이틀 ──
  useEffect(() => {
    if (pixel?.displayName) {
      document.title = `${pixel.displayName} - Pixelyf`
    } else if (!selectedPixelId) {
      document.title = t('defaultPageTitle')
    }
  }, [pixel?.displayName, selectedPixelId])

  // ── 방문 통계 ──
  useEffect(() => {
    if (!selectedPixelId) return
    const abortController = new AbortController()

    fetch(`/api/users/${selectedPixelId}/visits?galaxy=${galaxyKey}`, {
      method: 'POST',
      signal: abortController.signal
    })
      .then(() => fetch(`/api/users/${selectedPixelId}/statistics?galaxy=${galaxyKey}`, {
        signal: abortController.signal
      }))
      .then(res => res.json())
      .then(data => {
        if (data && data.data) {
          setVisitStats(data.data)
        }
      })
      .catch(e => {
        if (e.name !== 'AbortError') console.error('Visit stats fetch error', e)
      })

    return () => abortController.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPixelId])

  // ── reset (stale state flush에서 호출) ──
  const reset = () => {
    setPixel(null)
    setVisitStats(null)
    setLocalConnectedPixels([])
  }

  return {
    pixel,
    setPixel,  // 본체의 stale state flush에서 사용
    visitStats,
    setVisitStats,
    bondsLoading,
    isBondsOpen,
    setIsBondsOpen,
    localConnectedPixels,
    reset,
  }
}
