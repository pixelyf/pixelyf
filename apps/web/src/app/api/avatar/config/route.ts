import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/avatar/config — 내 아바타 꾸미기 설정 조회
 * PUT /api/avatar/config — 내 아바타 꾸미기 설정 저장
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: config, error } = await supabase
      .from('user_avatar_config')
      .select('base_character, equipped_slots, updated_at')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (신규 유저)
      console.error('[Avatar Config] Query Error:', error)
      return NextResponse.json({ error: 'Failed to fetch avatar config' }, { status: 500 })
    }

    return NextResponse.json({
      config: config || { base_character: 'spineboy', equipped_slots: {} },
    })
  } catch (error) {
    console.error('[Avatar Config] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { base_character, equipped_slots } = body

    if (!base_character || typeof base_character !== 'string') {
      return NextResponse.json({ error: 'base_character is required' }, { status: 400 })
    }

    // equipped_slots 유효성 검증: Record<string, string> 형태만 허용
    if (equipped_slots && typeof equipped_slots !== 'object') {
      return NextResponse.json({ error: 'equipped_slots must be a JSON object' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('user_avatar_config')
      .upsert({
        user_id: user.id,
        base_character,
        equipped_slots: equipped_slots || {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select('base_character, equipped_slots, updated_at')
      .single()

    if (error) {
      console.error('[Avatar Config] Upsert Error:', error)
      return NextResponse.json({ error: 'Failed to save avatar config' }, { status: 500 })
    }

    // users와 user_coordinates의 avatar_type 업데이트 동기화
    const newAvatarType = base_character === 'none' ? 'image' : 'spine'

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ avatar_type: newAvatarType })
      .eq('id', user.id)

    if (userUpdateError) {
      console.error('[Avatar Config] User avatar_type update error:', userUpdateError)
    }

    const { error: coordUpdateError } = await supabase
      .from('user_coordinates')
      .update({ avatar_type: newAvatarType })
      .eq('user_id', user.id)

    if (coordUpdateError) {
      console.error('[Avatar Config] Coordinate avatar_type update error:', coordUpdateError)
    }

    return NextResponse.json({ config: data })
  } catch (error) {
    console.error('[Avatar Config] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
