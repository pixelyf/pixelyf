import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { UserProfile } from '@/entities/user/model/useUserStore'

/**
 * 서버 컴포넌트용 현재 로그인 유저 프로필 조회 헬퍼
 * 
 * - Supabase Server Client의 쿠키 세션 기반으로 authUser 식별
 * - Supabase 데이터베이스 및 Prisma 연계를 통해 상세 정보(은하 좌표, 매장 여부 등) 통합 조회
 * - 클라이언트 useUserStore(UserProfile) 규격으로 평탄화(Flatten)하여 반환
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    const supabase = await createClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return null
    }

    // Supabase 데이터베이스에서 상세 유저 데이터 조회
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select(`
        *,
        coordinate:user_coordinates ( coord_x, coord_y, z_depth, galaxy_key, display_name, avatar_image_url, avatar_type, status_message, rank ),
        persona:user_personas ( persona_code, persona_name, persona_color )
      `)
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileError) {
      console.error('[getCurrentUser] Profile Query Error:', profileError)
      return null
    }
    if (!userProfile) {
      // 신규 유저 또는 온보딩 미완료 → 정상 케이스, 조용히 null 반환
      return null
    }

    // 은하별 픽셀 좌표 맵 빌드: { [galaxyKey]: { x, y, display_name, avatar_url, avatar_type, status_message } }
    const coordinatesMap: Record<string, { x: number; y: number; display_name?: string; avatar_url?: string; avatar_type?: string; status_message?: string }> = {}
    const coordArr = userProfile.coordinate
    
    if (Array.isArray(coordArr)) {
      coordArr.forEach((c: any) => {
        if (c.galaxy_key) {
          coordinatesMap[c.galaxy_key] = { 
            x: c.coord_x, 
            y: c.coord_y,
            display_name: c.display_name,
            avatar_url: c.avatar_image_url,
            avatar_type: c.avatar_type,
            status_message: c.status_message
          }
        }
      })
    }

    // 기본 은하(PIXELYF) 기준 2D 좌표 추출
    const defaultCoord = Array.isArray(coordArr)
      ? (coordArr.find((c: any) => c.galaxy_key === 'PIXELYF') || coordArr[0])
      : coordArr

    // Prisma를 통한 제휴 매장 상세 정보 조회
    const storeDetail = await prisma.storeDetail.findUnique({
      where: { user_id: authUser.id }
    })

    // 클라이언트 Zustand UserProfile 인터페이스 규격으로 포맷팅
    return {
      id: userProfile.id,
      email: authUser.email!,
      display_name: userProfile.display_name,
      pixel_id: userProfile.pixel_id,
      coordX: defaultCoord?.coord_x,
      coordY: defaultCoord?.coord_y,
      coordinates: coordinatesMap,
      role: userProfile.role || 'USER',
      persona_code: userProfile.persona?.persona_code || 'STARTER',
      avatar_url: userProfile.avatar_image_url || authUser.user_metadata?.avatar_url,
      status_message: userProfile.status_message,
      current_mood_id: userProfile.current_mood_id,
      stardust_balance: userProfile.stardust_balance,
      activity_score: Number(userProfile.activity_score || 0),
      supernova_tier: userProfile.supernova_tier,
      supernova_expires_at: userProfile.supernova_expires_at,
      ai_enabled: userProfile.ai_enabled,
      ai_primary_provider: userProfile.ai_primary_provider,
      language: userProfile.language || 'ko',
      feed_translation_languages: userProfile.feed_translation_languages || [],
      push_touch_enabled: userProfile.push_touch_enabled ?? true,
      push_ping_enabled: userProfile.push_ping_enabled ?? true,
      push_comment_enabled: userProfile.push_comment_enabled ?? true,
      push_bond_enabled: userProfile.push_bond_enabled ?? true,
      push_marketing_enabled: userProfile.push_marketing_enabled ?? false,
      store_detail: storeDetail ? {
        phone: storeDetail.phone || undefined,
        address: storeDetail.address || undefined,
        google_place_id: storeDetail.google_place_id || undefined,
        latitude: storeDetail.latitude || undefined,
        longitude: storeDetail.longitude || undefined,
        business_hours: storeDetail.business_hours || undefined,
        menu_info: storeDetail.menu_info ? (storeDetail.menu_info as any[]) : undefined,
        gallery_photos: storeDetail.gallery_photos || [],
        description: storeDetail.description || undefined,
      } : null
    }
  } catch (error) {
    console.error('[getCurrentUser] Exception occurred:', error)
    return null
  }
}
