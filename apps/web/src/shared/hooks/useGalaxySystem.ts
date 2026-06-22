'use client'

import useSWR from 'swr'
import { useCallback, useEffect, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { idbGet, idbSet } from '@/shared/lib/idb'

/**
 * 은하 시스템 동적 데이터 타입
 */
export interface GalaxySystemCategory {
  id: string
  key: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  type: string
  sortOrder: number
}

export interface GalaxySystemItem {
  id: string
  key: string
  partnerCode: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  centerX: number
  centerY: number
  isRoot: boolean
  sortOrder: number
  categories: GalaxySystemCategory[]
}

// SWR fetcher
const fetcher = (url: string): Promise<GalaxySystemItem[]> =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(`Galaxy API error: ${res.status}`)
    return res.json()
  }).then(json => json.data || [])

/**
 * 은하 시스템 동적 데이터 훅 (SWR 기반)
 *
 * 관리자에서 등록한 은하/카테고리를 프론트엔드에서 동적으로 조회합니다.
 * - SWR 자동 deduplication (동일 키 중복 요청 방지)
 * - React Context 기반 캐시 공유 (멀티 컴포넌트 동기화)
 * - 에러 자동 재시도
 * - SSR 안전 (모듈 레벨 변수 없음)
 */
export function useGalaxySystem() {
  const locale = useLocale()
  const cacheKey = `pixelyf_galaxy_system_${locale}`

  const { data: galaxies = [], isLoading, error, mutate } = useSWR<GalaxySystemItem[]>(
    `/api/system/galaxies?locale=${locale}`,
    fetcher,
    {
      revalidateOnFocus: false,   // 은하 메타데이터는 탭 복귀 시 갱신 불필요
      revalidateOnReconnect: true, // 네트워크 복구 시 갱신
      dedupingInterval: 3600000,  // 1시간 내 동일 요청 dedup
      errorRetryCount: 3,         // 에러 시 3회 재시도
      fallbackData: [],           // SSR/초기 렌더 시 빈 배열
    }
  )

  // [IDB SWR] 마운트 시 IDB 캐시를 SWR에 즉시 주입 (0초 은하 UI 렌더링)
  useEffect(() => {
    idbGet<GalaxySystemItem[]>(cacheKey).then(cached => {
      if (cached && cached.length > 0) {
        // 캐시 데이터에 기본 은하인 PIXELYF가 포함되어 있는지 유효성 검사
        const hasRoot = cached.some(g => g.key === 'PIXELYF')
        mutate(cached, !hasRoot)  // 구버전 캐시의 경우에만 Revalidate를 트리거하여 강제 치유
      }
    })
  }, [mutate, cacheKey])

  // [IDB SWR] API 성공 시 IDB 캐시 갱신
  useEffect(() => {
    if (galaxies.length > 0) {
      idbSet(cacheKey, galaxies).catch(console.error)
    }
  }, [galaxies, cacheKey])

  const getGalaxyByKey = useCallback((key: string) => {
    return galaxies.find(g => g.key === key) || null
  }, [galaxies])

  const getCategoriesByGalaxy = useCallback((galaxyKey: string): GalaxySystemCategory[] => {
    const galaxy = galaxies.find(g => g.key === galaxyKey)
    return galaxy?.categories || []
  }, [galaxies])

  // GALAXY_CATEGORY_MAP 동적 대체: { PIXELYF_CORE: [...] }
  const categoryMap = useMemo(() => {
    const map: Record<string, GalaxySystemCategory[]> = {}
    for (const g of galaxies) {
      map[g.key] = g.categories
    }
    return map
  }, [galaxies])

  const rootGalaxy = useMemo(() => {
    return galaxies.find(g => g.isRoot) || galaxies[0] || null
  }, [galaxies])

  /** 캐시 강제 무효화 (관리자 CRUD 후 호출) */
  const invalidate = useCallback(() => mutate(), [mutate])

  return {
    galaxies,
    isLoading,
    error,
    getGalaxyByKey,
    getCategoriesByGalaxy,
    categoryMap,
    rootGalaxy,
    invalidate,
  }
}
