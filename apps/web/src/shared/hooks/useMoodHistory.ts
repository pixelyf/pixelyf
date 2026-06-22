'use client'

import useSWR from 'swr'
import { useUserStore } from '@/entities/user/model/useUserStore'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface MoodHistoryResponse {
  records: Array<{
    recorded_date: string
    mood_id: string
    aura: string
  }>
  stats: {
    dominant_mood: string
    breakdown: Record<string, number>
    total_recorded_days: number
  }
}

/**
 * 생각 상태(Mood) 히스토리 페칭 훅
 * (프로젝트 표준에 맞춰 React Query 대신 SWR을 사용하여 5분 캐싱 구현)
 */
export function useMoodHistory(range: 'day' | 'week' | 'month' | 'year' | 'all' = 'week', date?: string) {
  const user = useUserStore((s) => s.user)
  
  const queryString = `range=${range}${date ? `&date=${date}` : ''}`
  
  const { data, error, isLoading, mutate } = useSWR<MoodHistoryResponse>(
    user ? `/api/users/mood-history?${queryString}` : null,
    fetcher,
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
    }
  )

  return {
    data,
    isLoading,
    isError: error,
    mutate,
  }
}
