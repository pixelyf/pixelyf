/**
 * [AI 에러 처리 모듈]
 * 프로바이더 API 에러를 사용자 친화적 메시지로 변환하고,
 * 401(키 만료) 시 자동 비활성화를 처리합니다.
 *
 * ⚠️ Prisma 직접 호출 사용 (서버 내부 로직, Supabase RLS 바이패스 허용)
 * API 라우트 내부에서는 Supabase service_role 클라이언트를 사용할 것.
 */

import prisma from '@/shared/lib/prisma'

/**
 * AI API 상태 코드에 대응하는 사용자 친화적 한국어 메시지를 반환합니다.
 */
export function getAiErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return '🔑 API 키가 만료되었거나 유효하지 않습니다. 설정에서 새 키를 입력해주세요.'
    case 402:
      return '💳 API 크레딧이 소진되었습니다. 프로바이더에서 충전해주세요.'
    case 429:
      return '⏳ 요청 한도에 도달했습니다. 잠시 후 자동으로 재시도됩니다.'
    case 500:
      return '⚠️ AI 서비스 서버에 일시적 문제가 발생했습니다.'
    case 503:
      return '🔧 AI 서비스가 점검 중입니다. 잠시 후 다시 시도해주세요.'
    default:
      return '⚠️ AI 서비스에 일시적 문제가 발생했습니다.'
  }
}

/**
 * API 키 무효(401) 발생 시 AI 자동 비활성화
 *
 * 처리:
 * 1. AiSoul.isActive = false
 * 2. User.ai_enabled = false
 * 3. AiProviderKey.isActive = false (해당 프로바이더)
 */
export async function handleKeyInvalid(userId: string, provider?: string): Promise<void> {
  try {
    // AiSoul 비활성화
    await prisma.aiSoul.updateMany({
      where: { userId },
      data: { isActive: false },
    })

    // User AI 비활성화
    await prisma.user.update({
      where: { id: userId },
      data: { ai_enabled: false },
    })

    // 해당 프로바이더 키 비활성화
    if (provider) {
      await prisma.aiProviderKey.updateMany({
        where: { userId, provider },
        data: { isActive: false },
      })
    }

    console.warn(`[AI] 키 무효 — userId=${userId} 자동 비활성화 완료`)
  } catch (err) {
    console.error(`[AI] handleKeyInvalid 실패:`, err)
  }
}
