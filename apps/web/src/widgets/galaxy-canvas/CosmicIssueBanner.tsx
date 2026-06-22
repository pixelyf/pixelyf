'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/shared/lib/supabase/browser'
import { useTranslations } from 'next-intl'

interface TrendingMoment {
  content: string
  ping_count: number
  galaxy_label: string
  galaxy_label_key: string
}

export function CosmicIssueBanner() {
  const t = useTranslations('Galaxy')
  const [issues, setIssues] = useState<TrendingMoment[]>([])
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // 최다 핑 수신 모먼트 조회
    const fetchTrending = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('moments')
          .select('content, ping_count, category')
          .eq('is_deleted', false)
          .gt('ping_count', 0)
          .order('ping_count', { ascending: false })
          .limit(5)

        if (error) throw error

        if (data && data.length > 0) {
          setIssues(data.map((d: { id?: string; category: string; description?: string; content?: string; ping_count?: number; source_url?: string; [key: string]: any }) => {
            let labelKey = 'clusterDefault'
            if (d.category === 'UNLEARN') labelKey = 'clusterUnlearn'
            else if (d.category === 'CONTINUOUS') labelKey = 'clusterContinuous'
            else if (d.category === 'INSIDE_ROOM') labelKey = 'clusterInsideRoom'
            else if (d.category === 'THOUGHT_SUBSCRIPTION') labelKey = 'clusterSubscription'
            else if (d.category === 'mood') labelKey = 'clusterMood'
            return {
              content: d.content,
              ping_count: d.ping_count || 0,
              galaxy_label: '',
              galaxy_label_key: labelKey,
            }
          }))
        }
      } catch (e) {
        console.error('[CosmicIssue] Fetch error:', e)
      }
    }
    fetchTrending()
  }, [])

  useEffect(() => {
    if (issues.length === 0) return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % issues.length)
        setVisible(true)
      }, 400)
    }, 6000)
    return () => clearInterval(interval)
  }, [issues.length])

  if (issues.length === 0) return null

  const current = issues[index]
  const preview = current.content.length > 40 ? `${current.content.substring(0, 40)}...` : current.content

  return (
    <div className="fixed top-[100px] left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div
        className={`transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
      >
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-full px-4 py-1.5 shadow-lg shadow-black/30 max-w-sm text-center">
          <p className="text-xs text-slate-300 truncate leading-relaxed">
            {t('trendingLabel', { preview, galaxy: t(current.galaxy_label_key as any), count: current.ping_count })}
          </p>
        </div>
      </div>
    </div>
  )
}
