/**
 * 상대 시간 포맷터 (모듈 레벨 순수 함수)
 * - 1분 미만: '방금'
 * - 1시간 미만: 'N분 전'
 * - 24시간 미만: 'N시간 전'
 * - 30일 미만: 'N일 전'
 * - 그 이상: 'N개월 전' 또는 'N년 전'
 */
export function relativeTime(dateInput: string | Date, t?: (key: string, values?: any) => string): string {
  if (!dateInput) return t ? t('justNow') : '방금'
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  
  if (isNaN(date.getTime())) {
    return t ? t('justNow') : '방금'
  }

  const now = Date.now()
  const diff = now - date.getTime()

  if (diff < 0) return t ? t('justNow') : '방금'

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (seconds < 60) {
    return t ? t('justNow') : '방금'
  }
  if (minutes < 60) {
    return t ? t('minutesAgo', { count: minutes }) : `${minutes}분 전`
  }
  if (hours < 24) {
    return t ? t('hoursAgo', { count: hours }) : `${hours}시간 전`
  }
  if (days < 30) {
    return t ? t('daysAgo', { count: days }) : `${days}일 전`
  }
  if (months < 12) {
    return t ? t('monthsAgo', { count: months }) : `${months}개월 전`
  }
  return t ? t('yearsAgo', { count: years }) : `${years}년 전`
}

/**
 * 가입 경과일 계산
 */
export function daysSince(dateInput: string | Date): number {
  if (!dateInput) return 0
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(date.getTime())) return 0
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

