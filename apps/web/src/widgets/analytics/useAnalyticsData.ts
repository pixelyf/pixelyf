'use client'

import { useState, useEffect, useCallback } from 'react'

export interface DailyDataPoint {
  date: string
  count: number
}

export interface CountryVisitor {
  country: string
  count: number
  percentage: number
}

export interface RecentVisitor {
  id: string
  displayName: string
  avatarUrl: string | null
  country: string
  visitedAt: string
}

export interface TopMoment {
  id: string
  content: string
  pingCount: number
  commentCount: number
  createdAt: string
}

export interface MoodDistItem {
  label: string
  count: number
}

export interface PingStat {
  ping_type: string
  count: number
}

export interface PingLogItem {
  id: string
  sender: {
    id: string
    displayName: string
    avatarUrl: string | null
    country: string
  } | null
  pingType: string
  isCrystal: boolean
  createdAt: string
  moment: {
    id: string
    content: string | null
  } | null
}

export interface TouchLogItem {
  id: string
  toucher: {
    id: string
    displayName: string
    avatarUrl: string | null
    country: string
  } | null
  createdAt: string
}

export interface BondLogItem {
  id: string
  partner: {
    id: string
    displayName: string
    avatarUrl: string | null
    country: string
  } | null
  createdAt: string
}

export interface AnalyticsUser {
  id: string
  displayName: string
  pixelId: string
  avatarUrl: string | null
  avatarType: string
  avatarSvgId: string | null
  currentAura: string
  country: string
  currentMoodId: string | null
}

export interface AnalyticsData {
  // 기본 통계
  visits: { today_visits: number; yesterday_visits: number; total_visits: number }
  touches: number
  bonds: number
  subscriptions: number
  comments: number
  supernovas: number
  pings: PingStat[]
  totalPings: number
  momentsCount: number
  user?: AnalyticsUser | null
  // 확장 (detail=full)
  period?: number
  dailyVisits?: DailyDataPoint[]
  dailyTouches?: DailyDataPoint[]
  dailyPings?: DailyDataPoint[]
  dailyMoments?: DailyDataPoint[]
  visitorsByCountry?: CountryVisitor[]
  recentVisitors?: RecentVisitor[]
  topMoments?: TopMoment[]
  sentPings?: number
  sentTouches?: number
  moodDistribution?: MoodDistItem[]
  recentPings?: PingLogItem[]
  recentTouches?: TouchLogItem[]
  recentBonds?: BondLogItem[]
  // 이전 기간 비교 (변화율 계산용)
  previousPeriod?: {
    visits: number
    touches: number
    pings: number
    moments: number
  } | null
}

/**
 * Analytics 대시보드 데이터 fetch 훅
 * React Query 미설치 환경 — useState + useEffect 패턴
 */
export function useAnalyticsData(userId: string | undefined, period: number = 28) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/users/${userId}/statistics?detail=full&period=${period}`)
      if (!res.ok) throw new Error('Failed to fetch analytics')
      const json = await res.json()
      if (!json.success) throw new Error('API returned error')
      setData(json.data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [userId, period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
