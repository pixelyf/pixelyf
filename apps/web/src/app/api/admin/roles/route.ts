import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import { requirePermission } from '@/shared/lib/adminAuth'

async function requireRolesManager(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
  const permission = await requirePermission(user.id, 'roles:manage', clientIp)
  if (!permission.isAuthorized) {
    return {
      response: NextResponse.json({ success: false, error: 'Forbidden', reason: permission.reason }, { status: 403 }),
    }
  }

  return { user, clientIp }
}

// GET: 관리자 목록 및 권한 정보 조회
export async function GET(req: Request) {
  try {
    const auth = await requireRolesManager(req)
    if ('response' in auth) return auth.response

    // 1. Authorization - 권한 관리 페이지 접근은 roles:manage 권한 필요
    // 실제 운영에서는 세션 토큰 등에서 userId를 가져와야 합니다.
    // 현재 구현에서는 API 테스트를 위해 하드코딩된 헤더나 쿠키 등 검증 로직이 필요하지만,
    // 이 파일은 엔드포인트 틀로 제공됩니다.
    // 임시로 SUPER_ADMIN 유저 목록 조회만 수행하도록 구성합니다.
    
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['CONTENT_ADMIN', 'SUPER_ADMIN'] }
      },
      include: {
        admin_profile: true
      },
      orderBy: { created_at: 'desc' }
    })

    // BigInt 직렬화 에러 해결
    const serializedAdmins = admins.map((admin: any) => ({
      ...admin,
      activity_score: admin.activity_score.toString()
    }))

    return NextResponse.json({ success: true, data: serializedAdmins })
  } catch (error: any) {
    console.error('Error fetching admin roles:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT: 관리자 권한 및 프로필 정보 업데이트
export async function PUT(req: Request) {
  try {
    const auth = await requireRolesManager(req)
    if ('response' in auth) return auth.response

    // 권한 체크 로직 (운영 시 사용자 ID 검증 필요)
    const body = await req.json()
    const { userId, permissions, allowed_ips } = body

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 })
    }

    const updatedProfile = await prisma.adminProfile.upsert({
      where: { user_id: userId },
      update: {
        permissions: permissions || [],
        allowed_ips: allowed_ips || []
      },
      create: {
        user_id: userId,
        permissions: permissions || [],
        allowed_ips: allowed_ips || []
      }
    })

    // Audit Log 기록 (옵션)
    await prisma.adminAuditLog.create({
      data: {
        admin_id: auth.user.id,
        action: 'UPDATE_ROLE_PROFILE',
        resource_type: 'AdminProfile',
        resource_id: userId,
        details: { permissions, allowed_ips },
        ip_address: auth.clientIp
      }
    })

    return NextResponse.json({ success: true, data: updatedProfile })
  } catch (error: any) {
    console.error('Error updating admin role:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST: 일반 유저를 관리자로 승격 (추가)
export async function POST(req: Request) {
  try {
    const auth = await requireRolesManager(req)
    if ('response' in auth) return auth.response

    const body = await req.json()
    const { pixel_id } = body

    if (!pixel_id) {
      return NextResponse.json({ success: false, error: 'Pixel ID is required' }, { status: 400 })
    }

    // 1. 유저 찾기
    const user = await prisma.user.findUnique({
      where: { pixel_id }
    })

    if (!user) {
      return NextResponse.json({ success: false, error: '해당 Pixel ID를 가진 유저를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (user.role === 'CONTENT_ADMIN' || user.role === 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: '이미 관리자 권한을 가진 유저입니다.' }, { status: 400 })
    }

    // 2. 권한 변경 및 AdminProfile 생성 (트랜잭션)
    const updatedUser = await prisma.$transaction(async (tx: any) => {
      // 역할 변경
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { role: 'CONTENT_ADMIN' }
      })

      // AdminProfile 생성 (기본 권한 없음)
      await tx.adminProfile.upsert({
        where: { user_id: user.id },
        update: {},
        create: {
          user_id: user.id,
          permissions: [],
          allowed_ips: []
        }
      })

      // Audit 기록
      await tx.adminAuditLog.create({
        data: {
          admin_id: auth.user.id,
          action: 'PROMOTE_TO_ADMIN',
          resource_type: 'User',
          resource_id: user.id,
          details: { previous_role: user.role, new_role: 'CONTENT_ADMIN' },
          ip_address: auth.clientIp
        }
      })

      return updated
    })

    return NextResponse.json({ success: true, data: updatedUser })
  } catch (error: any) {
    console.error('Error promoting admin:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

