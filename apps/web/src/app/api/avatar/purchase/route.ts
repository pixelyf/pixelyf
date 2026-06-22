import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/avatar/purchase — 아이템 구매 (원자적 RPC)
 * 
 * Body: { item_code: string }
 * 
 * DB-level 원자성:
 * - SELECT FOR UPDATE로 잔액 행 잠금
 * - 잔액 차감 + 인벤토리 추가 + 거래 기록을 단일 트랜잭션 내에서 처리
 * - 동시 구매 요청 시 이중 차감 방지
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { item_code } = body

    if (!item_code || typeof item_code !== 'string') {
      return NextResponse.json({ error: 'item_code is required' }, { status: 400 })
    }

    // 원자적 RPC 호출 (SELECT FOR UPDATE + 단일 트랜잭션)
    const { data, error } = await supabase.rpc('purchase_avatar_item', {
      p_user_id: user.id,
      p_item_code: item_code,
    })

    if (error) {
      console.error('[Avatar Purchase] RPC Error:', error)
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }

    // RPC 함수가 반환한 JSON 구조 파싱
    const result = data as {
      success?: boolean
      error?: string
      status?: number
      item?: { item_code: string; name: string; slot_category: string }
      balance?: number
      required?: number
      current?: number
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error, required: result.required, current: result.current },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({
      success: result.success,
      item: result.item,
      balance: result.balance,
    })
  } catch (error) {
    console.error('[Avatar Purchase] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
