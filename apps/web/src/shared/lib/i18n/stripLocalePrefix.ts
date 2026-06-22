import { routing } from '@/i18n/routing'

/**
 * URL pathname에서 locale prefix를 제거하여 순수 경로를 반환합니다.
 * 
 * 예시:
 * - '/en/settings' → '/settings'
 * - '/ja/partner'  → '/partner'
 * - '/settings'    → '/settings'  (ko는 prefix 없으므로 변경 없음)
 * - '/'            → '/'
 * 
 * @param pathname - window.location.pathname 또는 유사한 경로 문자열
 * @returns locale prefix가 제거된 순수 경로
 */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/')
  const maybeLocale = segments[1]

  // 기본 로케일(ko)은 prefix가 없으므로 제거할 필요 없음
  if (
    maybeLocale &&
    routing.locales.includes(maybeLocale as typeof routing.locales[number]) &&
    maybeLocale !== routing.defaultLocale
  ) {
    const stripped = '/' + segments.slice(2).join('/')
    return stripped || '/'
  }

  return pathname
}
