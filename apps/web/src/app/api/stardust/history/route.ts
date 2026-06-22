import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 50)
    const category = url.searchParams.get('category') // SUPERNOVA, RECHARGE, etc.
    const cursor = url.searchParams.get('cursor') // 마지막 항목의 created_at

    let query = supabase
      .from('stardust_transactions')
      .select('id, type, amount, balance_after, category, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit + 1) // +1로 hasMore 판별

    if (category) {
      query = query.eq('category', category)
    }
    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: transactions, error } = await query

    if (error) {
      console.error('[Stardust History] Query Error:', error)
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    const hasMore = (transactions || []).length > limit
    const sliced = hasMore ? (transactions || []).slice(0, limit) : (transactions || [])
    const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].created_at : null

    return NextResponse.json({
      transactions: sliced,
      hasMore,
      nextCursor,
    })
  } catch (error) {
    console.error('[Stardust History] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
