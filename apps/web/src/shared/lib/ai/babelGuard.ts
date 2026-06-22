/**
 * [Babel Guard]
 * BFP 번역 파이프라인 전방 가드 유틸리티.
 * 번역 비용 낭비를 최소화하기 위해 무의미 콘텐츠를 사전 필터링합니다.
 *
 * 업계 표준 준수:
 * - 공식적인 글자수 임계값은 존재하지 않음 (X/Facebook/Instagram 공통)
 * - 의미론적 판별이 정석: "번역 가치가 있는 의미 단위인가"
 * - 감탄사/단일 반응어(ㅋㅋ, good, 👍) → 스킵이 정석
 */

/**
 * 텍스트 정규화 비교용 뼈대 추출 함수.
 * 공백, 특수문자, 이모지를 제거하여 순수 텍스트 골격만 추출합니다.
 * 주 용도: 수정 전/후 콘텐츠 실질 변경 여부 판별
 */
export function getCoreText(text: string): string {
  if (!text) return ''
  return text
    .replace(/\s+/g, '') // 모든 공백 및 줄바꿈 제거
    .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9]/g, '') // 영문, 한글, 숫자 제외 특수문자/이모지 제거
    .trim()
}

/**
 * 지능형 번역 가드: LLM 번역 비용 낭비를 최소화하기 위한 필터.
 *
 * 스킵 대상:
 * 1. 순수 URL만 단독으로 적힌 글
 * 2. 순수 숫자 및 부호만 있는 글
 * 3. 공백 제외 4자 이하의 극단적 단문 (good, ㅋㅋ, nice 등)
 * 4. 자음/모음 나열글 (ㅋㅋㅋ, ㅠㅠㅠ 등)
 * 5. 단일 문자 도배글 (aaaa, ㅎㅎㅎ 등)
 *
 * @returns true면 번역 스킵, false면 번역 진행
 */
export function isTranslationSkipped(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true

  // 1. [순수 URL 가드] URL만 단독으로 적힌 글은 번역 스킵
  const urlRegex = /^(https?:\/\/[^\s]+)$/i
  if (urlRegex.test(trimmed)) return true

  // 2. [순수 숫자 및 부호 가드] 숫자, 특수 기호, 쉼표/마침표만 있는 글 스킵
  const numericRegex = /^[0-9\s.,:\-_/()[\]{}]+$/
  if (numericRegex.test(trimmed)) return true

  // 3. [공백 제외 글자수 가드] 공백 제외 4자 이하의 극단적 단문 스킵
  const pureLength = trimmed.replace(/\s+/g, '').length
  if (pureLength <= 4) return true

  // 4. [자음/모음 가드] 자음/모음 나열글 (ㅋㅋㅋ, ㅠㅠㅠ 등) 스킵
  const isJamoOnly = /^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(trimmed)
  if (isJamoOnly) return true

  // 5. [단일 문자 도배 가드] 동일 문자 연속 반복글 스킵
  const isRepetitive = /^(.)\1+$/.test(trimmed)
  if (isRepetitive) return true

  return false
}
