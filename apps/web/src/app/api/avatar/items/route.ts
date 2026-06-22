import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/avatar/items — 아바타 아이템 카탈로그 조회
 * slot_category 필터 지원 (character_base, hair, top, bottom, accessory, effect)
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const category = url.searchParams.get('category')

    let query = supabase
      .from('items')
      .select('id, item_code, item_type, name, description, price_star_dust, is_limited, spine_asset_path, preview_image_url, slot_category, rarity, expires_at')
      .order('rarity', { ascending: false })
      .order('price_star_dust', { ascending: true })

    // slot_category 필터 (아바타 관련 아이템만)
    if (category) {
      query = query.eq('slot_category', category)
    } else {
      // slot_category가 있는 아이템만 (아바타 꾸미기 아이템)
      query = query.not('slot_category', 'is', null)
    }

    const { data: items, error } = await query

    if (error) {
      console.error('[Avatar Items] Query Error:', error)
      return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
    }

    // 유저 보유 아이템 조회 (인벤토리)
    const { data: inventory } = await supabase
      .from('user_inventory')
      .select('item_id')
      .eq('user_id', user.id)

    const ownedItemIds = new Set((inventory || []).map(i => i.item_id))

    // 각 아이템에 보유 여부 표시
    const itemsWithOwnership = (items || []).map(item => ({
      ...item,
      owned: ownedItemIds.has(item.id),
    }))

    return NextResponse.json({ items: itemsWithOwnership })
  } catch (error) {
    console.error('[Avatar Items] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
