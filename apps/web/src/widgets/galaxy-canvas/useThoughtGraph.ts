'use client'

/**
 * [생각그래프] 데이터 fetch + Realtime 구독 훅
 * 
 * galaxyStore.viewMode === 'thoughtGraph' 일 때만 활성화
 * - GET /api/thought-graph?galaxyKey=X&scope=Y → 노드/엣지 로드
 * - galaxyKey 또는 scope 변경 시 재조회
 */

import { useEffect, useCallback, useRef } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import type { ThoughtGraphResponse } from '@/shared/lib/thought-graph/types'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { createClient } from '@/shared/lib/supabase/browser'
import { useLocale } from 'next-intl'

export function useThoughtGraph() {
  const viewMode = useGalaxyStore(s => s.viewMode)
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const thoughtScope = useGalaxyStore(s => s.thoughtScope)
  const setThoughtData = useGalaxyStore(s => s.setThoughtData)
  const setIsThoughtGraphLoading = useGalaxyStore(s => s.setIsThoughtGraphLoading)
  const locale = useLocale()

  const user = useUserStore(s => s.user)
  const isLoading = useUserStore(s => s.isLoading)

  const abortRef = useRef<AbortController | null>(null)

  const fetchThoughtGraph = useCallback(async () => {
    if (viewMode !== 'thoughtGraph') return

    // [기획 적용] '내 생각(mine)' 스코프 조회를 시도하는데 비로그인 상태인 경우 API fetch 방어
    if (thoughtScope === 'mine' && !user && !isLoading) {
      return
    }

    // 이전 요청 취소
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setIsThoughtGraphLoading(true)

    try {
      const res = await fetch(
        `/api/thought-graph?galaxyKey=${galaxyKey}&scope=${thoughtScope}&locale=${locale}`,
        { signal: abortRef.current.signal }
      )

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'no body')
        console.error(`[ThoughtGraph] HTTP ${res.status}:`, errorBody)
        return // 에러 시 빈 상태 유지 (UI 크래시 방지)
      }

      const data: ThoughtGraphResponse = await res.json()
      setThoughtData(data.nodes, data.edges, data.totalCount, data.categoryCounts)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[ThoughtGraph] fetch 오류:', err)
      }
    } finally {
      setIsThoughtGraphLoading(false)
    }
  }, [viewMode, galaxyKey, thoughtScope, setThoughtData, setIsThoughtGraphLoading, user, isLoading, locale])

  // viewMode가 'thoughtGraph'로 전환되면 fetch
  useEffect(() => {
    if (viewMode === 'thoughtGraph') {
      fetchThoughtGraph()
    } else {
      // 픽셀리어로 복귀 시 데이터 정리 (메모리 절약)
      setThoughtData([], [])
    }

    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [viewMode, galaxyKey, thoughtScope, fetchThoughtGraph])

  // [긴급 버그 수정] AI 파이프라인의 실시간 관계 설정 브로드캐스트 감지 브릿지
  useEffect(() => {
    if (viewMode !== 'thoughtGraph' || !galaxyKey) return

    const supabase = createClient()
    const channelName = `thought-graph:${galaxyKey}`
    const channel = supabase.channel(channelName)

    channel
      .on('broadcast', { event: 'new-relationship' }, (payload: any) => {
        const relationships = payload.payload?.relationships || []
        relationships.forEach((rel: any) => {
          if (rel.status === 'pending') {
            window.dispatchEvent(
              new CustomEvent('thought-graph-toast', {
                detail: {
                  relationshipId: rel.id,
                  summary: rel.targetSummary, // AI가 연결한 과거 생각 서머리
                  relationType: rel.relationType,
                  confidence: rel.confidence,
                }
              })
            )
          }
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [viewMode, galaxyKey])

  return { refetch: fetchThoughtGraph }
}
