/**
 * 픽셀리프 이메일 발송 모듈
 * 
 * Resend SDK를 직접 호출하여 프리미엄 HTML 이메일을 발송합니다.
 * 에러 시 throw하지 않고 console.error만 출력하여 폴백 안전성을 보장합니다.
 * (Supabase GoTrue 기본 이메일이 폴백으로 동작)
 */

import { getResend } from '@/shared/lib/email/resend'
import { getSignupEmailHtml } from '@/shared/lib/email/templates/signup'
import { getRecoveryEmailHtml } from '@/shared/lib/email/templates/recovery'

// 발신자 주소 (Resend 도메인 인증 완료 기준)
// [INTENTIONAL] 이메일 발신자 주소는 픽셀리프 브랜드를 유지합니다.
// 발신자 브랜드를 픽셀리프로 통일하는 것이 의도된 설계입니다.
const FROM_ADDRESS = 'PIXELYF <welcome@send.pixelyf.com>'

/**
 * 회원가입 인증 이메일 발송
 * 
 * @param email - 수신자 이메일 주소
 * @param displayName - 사용자 닉네임
 * @param confirmationUrl - Supabase admin.generateLink()로 생성된 인증 URL
 * @returns 성공 여부
 */
export async function sendVerificationEmail(
  email: string,
  displayName: string,
  confirmationUrl: string
): Promise<boolean> {
  try {
    const resend = getResend()
    if (!resend) {
      console.warn('[Resend] API 키 미설정 → 이메일 발송 건너뜀 (Supabase 폴백 사용)')
      return false
    }

    const html = getSignupEmailHtml({ displayName, confirmationUrl })

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `픽셀리프 이메일 인증을 완료해 주세요`,
      html,
    })

    if (error) {
      console.error('[Resend] 회원가입 이메일 발송 실패:', error)
      return false
    }

    console.log('[Resend] 회원가입 이메일 발송 성공:', data?.id, '→', email)
    return true
  } catch (err) {
    console.error('[Resend] 회원가입 이메일 발송 예외:', err)
    return false
  }
}

/**
 * 비밀번호 재설정 이메일 발송 (향후 사용)
 * 
 * @param email - 수신자 이메일 주소
 * @param recoveryUrl - 비밀번호 재설정 URL
 * @returns 성공 여부
 */
export async function sendRecoveryEmail(
  email: string,
  recoveryUrl: string
): Promise<boolean> {
  try {
    const resend = getResend()
    if (!resend) {
      console.warn('[Resend] API 키 미설정 → 이메일 발송 건너뜀 (Supabase 폴백 사용)')
      return false
    }

    const html = getRecoveryEmailHtml({ recoveryUrl })

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: '✦ PIXELYF 비밀번호 재설정',
      html,
    })

    if (error) {
      console.error('[Resend] 비밀번호 재설정 이메일 발송 실패:', error)
      return false
    }

    console.log('[Resend] 비밀번호 재설정 이메일 발송 성공:', data?.id, '→', email)
    return true
  } catch (err) {
    console.error('[Resend] 비밀번호 재설정 이메일 발송 예외:', err)
    return false
  }
}
