/**
 * [Bonds IDB 캐시 — 공유 모듈]
 *
 * dataSync.ts와 PixelDetailDrawer 양쪽에서 사용하는 bonds IDB 캐시 로직.
 * dataSync 내부의 동일 로직을 독립 모듈로 추출하여 Drawer에서도 SWR 패턴을 적용합니다.
 *
 * Key: 'pixelyf_visited_bonds'
 * Value: Record<pixelId, { updatedAt: number, bonds: ConstellationBond[] }>
 */

import { idbGet, idbSet } from '@/shared/lib/idb'
import type { ConstellationBond } from '@/stores/galaxyStore'

const IDB_KEY = 'pixelyf_visited_bonds'
const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90일
const MAX_CACHE_SIZE = 100

interface CachedBonds {
  updatedAt: number
  bonds: ConstellationBond[]
}

/**
 * 특정 픽셀의 bond 캐시를 반환합니다 (TTL 내).
 * TTL 만료 시 빈 배열을 반환합니다.
 */
export async function getCachedBonds(pixelId: string): Promise<ConstellationBond[]> {
  const raw = (await idbGet<Record<string, CachedBonds>>(IDB_KEY)) || {}
  const cached = raw[pixelId]
  if (cached && Date.now() - cached.updatedAt < TTL_MS) {
    return cached.bonds
  }
  return []
}

/**
 * 특정 픽셀의 bond를 IDB 캐시에 저장합니다.
 * LRU 정책으로 MAX_CACHE_SIZE 초과 시 오래된 항목 삭제.
 */
export async function saveBondsToCache(pixelId: string, bonds: ConstellationBond[]): Promise<void> {
  const raw = (await idbGet<Record<string, CachedBonds>>(IDB_KEY)) || {}
  raw[pixelId] = { updatedAt: Date.now(), bonds }

  // LRU (가장 오래된 데이터 밀어내기)
  const keys = Object.keys(raw)
  if (keys.length > MAX_CACHE_SIZE) {
    keys.sort((a, b) => raw[a].updatedAt - raw[b].updatedAt)
    const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE)
    for (const k of toRemove) delete raw[k]
  }
  await idbSet(IDB_KEY, raw)
}
