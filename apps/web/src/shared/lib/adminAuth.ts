import prisma from '@/shared/lib/prisma'

export interface PermissionResult {
  isAuthorized: boolean
  reason?: 'USER_NOT_FOUND' | 'IP_NOT_ALLOWED' | 'PERMISSION_DENIED'
  user?: any // You can type this better using Prisma's User type if needed
}

/**
 * 관리자 권한 검증 유틸리티 (Next.js 범용: API, Server Component, Server Action)
 * 
 * @param userId - 검증할 사용자의 고유 ID
 * @param scope - 필요한 권한 스코프 (예: 'contents:delete')
 * @param clientIp - (옵션) 접속 클라이언트 IP. 프록시 환경에서는 x-forwarded-for 등에서 추출하여 전달해야 함
 * @returns 권한 승인 여부 및 관련 유저 정보
 */
export async function requirePermission(
  userId: string, 
  scope: string, 
  clientIp?: string
): Promise<PermissionResult> {
  const user = await prisma.user.findUnique({ 
    where: { id: userId }, 
    include: { admin_profile: true } 
  })
  
  if (!user) return { isAuthorized: false, reason: 'USER_NOT_FOUND' }

  // 1. IP 화이트리스트 최우선 검증 (SUPER_ADMIN이라도 예외 없음)
  const allowedIps = user.admin_profile?.allowed_ips || []
  if (allowedIps.length > 0) {
    if (!clientIp || !allowedIps.includes(clientIp.trim())) {
       return { isAuthorized: false, reason: 'IP_NOT_ALLOWED' }
    }
  }

  // 2. 최상위 관리자는 모든 권한 허용 (IP 방화벽 통과 후)
  if (user.role === 'SUPER_ADMIN') return { isAuthorized: true, user }

  // 3. 세부 권한 배열 체크
  if (user.admin_profile?.permissions?.includes(scope)) return { isAuthorized: true, user }
  
  return { isAuthorized: false, reason: 'PERMISSION_DENIED' }
}
