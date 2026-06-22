import { Resend } from 'resend'

// Resend 인스턴스 싱글턴 (지연 초기화)
// 서버 사이드에서만 사용 (Server Action, API Route)
// RESEND_API_KEY가 없으면 null을 반환하여 모듈 로드 크래시 방지
let _resend: Resend | null = null

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Resend] RESEND_API_KEY가 설정되지 않았습니다. 이메일 발송이 비활성화됩니다.')
    return null
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

export default getResend
