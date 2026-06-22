import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { getMoodColors } from '@/shared/constants/moods'

const MOOD_TO_AURA: Record<string, string> = {
  // 1. 긍정 & 활기
  happy: 'ENERGY', anticipation: 'ENERGY',
  // 2. 평온 & 사랑
  love: 'CALM', peace: 'CALM', calm: 'CALM',
  // 3. 지적 & 사유
  reflection: 'DRIFT', curious: 'PASSION', determination: 'PASSION', passion: 'PASSION',
  // 4. 침잠 & 지침
  sad: 'CLOUD', tired: 'CLOUD',
  // 5. 중립
  neutral: 'GLOW',
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { moodId, localDate } = await request.json()
    const newAura = MOOD_TO_AURA[moodId] || 'GLOW'
    const moodColors = getMoodColors(moodId)
    const recordedDate = localDate || new Date().toISOString().split('T')[0]

    // 1. Sync User Aura Status & Mood ID
    const { error: userError } = await supabase
      .from('users')
      .update({ 
        current_aura: newAura,
        current_mood_id: moodId // [FIX]: 현재 선택된 정확한 Mood ID 저장
      })
      .eq('id', user.id)

    if (userError) throw userError

    // 2. Sync Persona Visual Colors (Important for Canvas Rendering)
    // [FIX]: 사용자가 선택한 기분의 실제 색상을 페르소나 테이블에 동기화하여 
    // 은하계 스타의 색상이 즉시 반영되도록 처리 (빛남 고정 버그 해결)
    const { error: personaError } = await supabase
      .from('user_personas')
      .update({ 
        glow_color_primary: moodColors.primary,
        glow_color_secondary: moodColors.secondary,
        persona_name: moodColors.label // 예: '빛남', '평온' 등
      })
      .eq('user_id', user.id)

    if (personaError) throw personaError

    // === [NEW] 일별 히스토리 Daily Upsert ===
    const { error: historyError } = await supabase
      .from('user_mood_history')
      .upsert(
        {
          user_id: user.id,
          mood_id: moodId,
          aura: newAura,
          recorded_date: recordedDate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,recorded_date' }
      )

    if (historyError) throw historyError

    return NextResponse.json({ success: true, aura: newAura })
  } catch (error) {
    console.error('Update Aura Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
