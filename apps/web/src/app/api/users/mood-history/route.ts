import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { subDays, startOfMonth, startOfYear, startOfDay, endOfDay } from 'date-fns'
import { LEGACY_ID_MAP } from '@/shared/constants/moods'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || 'week' // 'day' | 'week' | 'month' | 'year' | 'all'
    const dateParam = searchParams.get('date')
    const targetDate = dateParam ? new Date(dateParam) : new Date()

    let fromDateStr: string | null = null
    const toDateStr = targetDate.toLocaleDateString('sv-SE') // 'YYYY-MM-DD'

    if (range === 'day') {
      fromDateStr = targetDate.toLocaleDateString('sv-SE')
    } else if (range === 'week') {
      const fromDate = subDays(targetDate, 7)
      fromDateStr = fromDate.toLocaleDateString('sv-SE')
    } else if (range === 'month') {
      const fromDate = startOfMonth(targetDate)
      fromDateStr = fromDate.toLocaleDateString('sv-SE')
    } else if (range === 'year') {
      const fromDate = startOfYear(targetDate)
      fromDateStr = fromDate.toLocaleDateString('sv-SE')
    } else if (range !== 'all') {
      const fromDate = subDays(targetDate, 7)
      fromDateStr = fromDate.toLocaleDateString('sv-SE')
    }

    let query = supabase
      .from('user_mood_history')
      .select('recorded_date, mood_id, aura')
      .eq('user_id', user.id)
      .lte('recorded_date', toDateStr)
      .order('recorded_date', { ascending: true })

    if (fromDateStr) {
      query = query.gte('recorded_date', fromDateStr)
    }

    const { data, error } = await query

    if (error) throw error

    const breakdown: Record<string, number> = {}
    data?.forEach(r => {
      const effectiveMoodId = LEGACY_ID_MAP[r.mood_id] || r.mood_id
      breakdown[effectiveMoodId] = (breakdown[effectiveMoodId] || 0) + 1
    })

    const dominant_mood = Object.entries(breakdown)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'neutral'

    return NextResponse.json({
      records: data || [],
      stats: {
        dominant_mood,
        breakdown,
        total_recorded_days: data?.length || 0
      }
    })
  } catch (error) {
    console.error('Mood history fetch error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
