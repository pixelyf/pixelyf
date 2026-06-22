import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { findBlockedWord } from '@/shared/constants/blockedWords'
import prisma from '@/shared/lib/prisma'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch full profile with coordinates and persona
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        coordinate:user_coordinates(coord_x, coord_y, z_depth, galaxy_key, display_name, avatar_image_url, avatar_type, status_message),
        persona:user_personas(persona_code, persona_name, persona_color)
      `)
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('Fetch Me Error:', error)
      return NextResponse.json({ error: 'User mapping not found' }, { status: 404 })
    }

    // [DAG-2] 소정 유저는 5개 레코드 배열 반환 → 안전 처리
    const coordArr = data.coordinate
    const coord = Array.isArray(coordArr)
      ? (coordArr.find((c: any) => c.galaxy_key === 'PIXELYF' || c.galaxy_key === null) || coordArr[0])
      : coordArr

    // Build coordinates map: { PIXELYF_CORE: {x, y, display_name, avatar_url}, ... }
    const coordinatesMap: Record<string, { x: number; y: number; display_name?: string; avatar_url?: string; avatar_type?: string; status_message?: string }> = {}
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

    // Flatten response for easy use in store
    const storeDetail = await prisma.storeDetail.findUnique({
      where: { user_id: user.id }
    })

    return NextResponse.json({
      id: data.id,
      email: user.email,
      display_name: data.display_name,
      pixel_id: data.pixel_id,
      coordX: coord?.coord_x,
      coordY: coord?.coord_y,
      coordinates: coordinatesMap,
      role: data.role || 'USER',
      persona_code: data.persona?.persona_code || 'STARTER',
      avatar_url: data.avatar_image_url || user.user_metadata?.avatar_url,
      status_message: data.status_message, 
      current_mood_id: data.current_mood_id,
      stardust_balance: data.stardust_balance,
      activity_score: data.activity_score,
      created_at: data.created_at,
      supernova_tier: data.supernova_tier,
      supernova_expires_at: data.supernova_expires_at,
      ai_enabled: data.ai_enabled,
      ai_primary_provider: data.ai_primary_provider,
      push_touch_enabled: data.push_touch_enabled ?? true,
      push_ping_enabled: data.push_ping_enabled ?? true,
      push_comment_enabled: data.push_comment_enabled ?? true,
      push_bond_enabled: data.push_bond_enabled ?? true,
      push_marketing_enabled: data.push_marketing_enabled ?? false,
      language: data.language || 'ko',
      feed_translation_languages: data.feed_translation_languages || [],
      store_detail: storeDetail ? {
        phone: storeDetail.phone,
        address: storeDetail.address,
        google_place_id: storeDetail.google_place_id,
        latitude: storeDetail.latitude,
        longitude: storeDetail.longitude,
        business_hours: storeDetail.business_hours,
        menu_info: storeDetail.menu_info,
        gallery_photos: storeDetail.gallery_photos,
        description: storeDetail.description,
      } : null
    })
  } catch (error) {
    console.error('Me API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { display_name, avatar_url, status_message, galaxy_key, push_touch_enabled, push_ping_enabled, push_comment_enabled, push_bond_enabled, push_marketing_enabled, feed_translation_languages, phone, address, google_place_id, latitude, longitude, business_hours, menu_info, gallery_photos, description } = body

    // [Babel Feed] 번역 설정 변경인 경우
    if (feed_translation_languages !== undefined) {
      const { error } = await supabase
        .from('users')
        .update({
          feed_translation_languages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) {
        console.error('Update translation settings Error:', error)
        return NextResponse.json({ error: 'Failed to update translation settings' }, { status: 500 })
      }
      return NextResponse.json({ success: true, feed_translation_languages })
    }

    // [PUSH] 알림 설정 변경인 경우 (설정 페이지 토글)
    const hasPushSettings = push_touch_enabled !== undefined || 
                            push_ping_enabled !== undefined || 
                            push_comment_enabled !== undefined || 
                            push_bond_enabled !== undefined || 
                            push_marketing_enabled !== undefined

    if (hasPushSettings && !display_name) {
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
      if (push_touch_enabled !== undefined) updateData.push_touch_enabled = !!push_touch_enabled
      if (push_ping_enabled !== undefined) updateData.push_ping_enabled = !!push_ping_enabled
      if (push_comment_enabled !== undefined) updateData.push_comment_enabled = !!push_comment_enabled
      if (push_bond_enabled !== undefined) updateData.push_bond_enabled = !!push_bond_enabled
      if (push_marketing_enabled !== undefined) updateData.push_marketing_enabled = !!push_marketing_enabled

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id)

      if (error) {
        console.error('Update push settings Error:', error)
        return NextResponse.json({ error: 'Failed to update push settings' }, { status: 500 })
      }
      return NextResponse.json({ success: true, ...updateData })
    }

    if (!display_name || display_name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const trimmedName = display_name.trim()

    // [PROD] 서버사이드 길이 제한
    if (trimmedName.length > 20) {
      return NextResponse.json({ error: '닉네임은 20자 이내여야 합니다.' }, { status: 400 })
    }
    if (status_message && status_message.length > 50) {
      return NextResponse.json({ error: '상태메시지는 50자 이내여야 합니다.' }, { status: 400 })
    }

    // [PROD] 금칙어 필터
    const blockedInName = findBlockedWord(trimmedName)
    if (blockedInName) {
      return NextResponse.json({ error: `사용할 수 없는 표현이 포함되어 있습니다: ${blockedInName}` }, { status: 400 })
    }
    if (status_message) {
      const blockedInStatus = findBlockedWord(status_message)
      if (blockedInStatus) {
        return NextResponse.json({ error: `상태메시지에 사용할 수 없는 표현이 포함되어 있습니다: ${blockedInStatus}` }, { status: 400 })
      }
    }

    // [PROD] 아바타 URL 형식 검증 (상대 경로 `/` 또는 https:// 허용)
    if (avatar_url) {
      const isValidUrl = avatar_url.startsWith('/') || avatar_url.startsWith('https://') ||
        (process.env.NODE_ENV === 'development' && avatar_url.startsWith('http://'))
      if (!isValidUrl) {
        return NextResponse.json({ error: '유효하지 않은 이미지 URL입니다.' }, { status: 400 })
      }
    }

    if (galaxy_key && galaxy_key !== 'GLOBAL') {
      const { error } = await supabase
        .from('user_coordinates')
        .update({
          display_name: trimmedName,
          avatar_image_url: avatar_url || null,
          avatar_type: avatar_url ? 'image' : 'default',
          status_message: status_message ?? null,
        })
        .eq('user_id', user.id)
        .eq('galaxy_key', galaxy_key)

      if (error) {
        console.error('Update Coordinate Error:', error)
        return NextResponse.json({ error: 'Failed to update galaxy profile' }, { status: 500 })
      }
    } else {
      const { error } = await supabase
        .from('users')
        .update({
          display_name: trimmedName,
          avatar_image_url: avatar_url || null,
          status_message: status_message || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) {
        console.error('Update Me Error:', error)
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
      }
    }

    // [BFP 실시간 다국어] 프로필 상태 메시지 수정 시 즉각 11개 국어 번역 수행 및 적재
    if (status_message !== undefined) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { language: true }
        })
        const { BabelTranslationService } = await import('@/shared/lib/ai/babelTranslationService')
        await BabelTranslationService.translateAndSaveProfile({
          userId: user.id,
          statusMessage: status_message,
          sourceLang: dbUser?.language || 'ko'
        })
      } catch (bfpError) {
        console.error('[PATCH Me BFP Profile Error (Non-critical)]:', bfpError)
      }
    }
    const hasStoreDetailUpdates = phone !== undefined || 
                                  address !== undefined || 
                                  google_place_id !== undefined || 
                                  latitude !== undefined || 
                                  longitude !== undefined || 
                                  business_hours !== undefined || 
                                  menu_info !== undefined || 
                                  gallery_photos !== undefined || 
                                  description !== undefined

    if (hasStoreDetailUpdates) {
      try {
        await prisma.storeDetail.upsert({
          where: { user_id: user.id },
          update: {
            phone: phone !== undefined ? phone : undefined,
            address: address !== undefined ? address : undefined,
            google_place_id: google_place_id !== undefined ? google_place_id : undefined,
            latitude: latitude !== undefined ? latitude : undefined,
            longitude: longitude !== undefined ? longitude : undefined,
            business_hours: business_hours !== undefined ? business_hours : undefined,
            menu_info: menu_info !== undefined ? menu_info : undefined,
            gallery_photos: gallery_photos !== undefined ? gallery_photos : undefined,
            description: description !== undefined ? description : undefined,
          },
          create: {
            user_id: user.id,
            phone: phone || null,
            address: address || null,
            google_place_id: google_place_id || null,
            latitude: latitude || null,
            longitude: longitude || null,
            business_hours: business_hours || null,
            menu_info: menu_info || null,
            gallery_photos: gallery_photos || [],
            description: description || null,
          }
        })
      } catch (storeDetailErr: any) {
        console.error('Failed to upsert store detail:', storeDetailErr)
        return NextResponse.json({ 
          error: `Failed to update store details: ${storeDetailErr?.message || storeDetailErr}` 
        }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, message: 'Profile updated successfully' })
  } catch (error: any) {
    console.error('PATCH Me API Error:', error)
    return NextResponse.json({ error: `Internal Server Error: ${error?.message || error}` }, { status: 500 })
  }
}

/**
 * [PROD] 회원탈퇴 (Soft Delete)
 * - users.is_active = false, display_name 익명화
 * - 모먼트 일괄 soft delete (is_deleted = true)
 * - Supabase Auth 세션 sign-out
 * 
 * 물리 삭제는 30일 유예 후 배치로 처리 (별도 스크립트)
 * CASCADE 관계로 물리 삭제 시 모든 하위 데이터 자동 정리
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. 유저 비활성화 + 개인정보 익명화
    const { error: updateError } = await supabase
      .from('users')
      .update({
        is_active: false,
        display_name: '탈퇴한 픽셀리어',
        avatar_image_url: null,
        status_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('[DELETE Me] User update error:', updateError)
      return NextResponse.json({ error: '회원탈퇴 처리에 실패했습니다.' }, { status: 500 })
    }

    // 2. 모먼트 일괄 soft delete
    const { error: momentError } = await supabase
      .from('moments')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('is_deleted', false)

    if (momentError) {
      console.error('[DELETE Me] Moment soft delete error:', momentError)
      // 모먼트 삭제 실패는 치명적이지 않으므로 계속 진행
    }

    // 3. Supabase Auth 세션 sign-out
    await supabase.auth.signOut()

    return NextResponse.json({ success: true, message: '회원탈퇴가 완료되었습니다. 30일 이내 재가입 시 데이터가 복구될 수 있습니다.' })
  } catch (error) {
    console.error('[DELETE Me] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
