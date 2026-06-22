/**
 * [금칙어 사전]
 * 닉네임/상태메시지에서 차단하는 금칙어 목록.
 * 프론트(실시간 경고) + 서버(/api/users/me PATCH) 양쪽에서 사용.
 *
 * 업데이트 시 이 파일만 수정하면 양쪽 동시 적용됨 (SSoT).
 */

export const BLOCKED_WORDS: string[] = [
  // 욕설/비속어
  '시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '지랄', 'ㅈㄹ',
  '새끼', 'ㅅㄲ', '개새', '닥쳐', '꺼져', '미친', '또라이',
  '씹', '좆', 'ㅈ같', '개같',
  // 차별/혐오
  '한남', '한녀', '김치녀', '맘충',
  // 사기/도용
  '관리자', 'admin', 'moderator', '운영자', '운영팀',
  'pixelyf', '픽셀리프',
  // 기타
  '자살', '자해',
]

/**
 * 주어진 텍스트에 금칙어가 포함되어 있는지 검사합니다.
 * @returns 발견된 금칙어 문자열, 없으면 null
 */
export function findBlockedWord(text: string): string | null {
  const normalized = text.toLowerCase().replace(/\s+/g, '')
  for (const word of BLOCKED_WORDS) {
    if (normalized.includes(word.toLowerCase())) {
      return word
    }
  }
  return null
}
