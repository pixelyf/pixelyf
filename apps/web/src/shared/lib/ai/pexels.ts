/**
 * [Pexels 이미지 검색 모듈]
 * AI POST에 관련 이미지를 자동 첨부하기 위한 Pexels API 래퍼.
 *
 * - 무료 티어: 200 req/hr, 20,000 req/월
 * - 라이선스: 상업적 사용 가능, 저작자 표시 권장
 * - Hotlink 허용 (직접 URL 사용 가능)
 */

// ─── 상수 ────────────────────────────────────────────────────

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || ''
const PEXELS_BASE_URL = 'https://api.pexels.com/v1'

/** POST에 이미지를 첨부할 확률 (30% — 자연스러운 SNS 패턴) */
export const IMAGE_ATTACH_PROBABILITY = 0.3

// ─── 타입 ────────────────────────────────────────────────────

export interface PexelsImage {
  /** 표시용 URL (medium 사이즈, 약 350px 폭) */
  url: string
  /** 원본 URL (라이트박스용) */
  originalUrl: string
  /** 촬영자 이름 */
  photographer: string
  /** 촬영자 Pexels 프로필 URL */
  photographerUrl: string
  /** 크레딧 문자열 */
  credit: string
}

// ─── API 호출 ────────────────────────────────────────────────

/**
 * Pexels에서 키워드로 이미지를 검색합니다.
 * 랜덤 페이지에서 1장을 선택하여 중복을 최소화합니다.
 *
 * @param keyword - 영어 검색 키워드 (LLM이 생성한 image_keyword)
 * @returns PexelsImage 또는 null (검색 결과 없음 / API 키 미설정 시)
 */
export async function searchPexelsImage(keyword: string): Promise<PexelsImage | null> {
  if (!PEXELS_API_KEY) {
    console.warn('[Pexels] PEXELS_API_KEY 미설정, 이미지 스킵')
    return null
  }

  if (!keyword || keyword.trim().length === 0) {
    return null
  }

  try {
    // 1단계: 첫 페이지로 총 결과 수 파악
    const firstRes = await fetch(
      `${PEXELS_BASE_URL}/search?query=${encodeURIComponent(keyword)}&per_page=1&page=1`,
      { headers: { Authorization: PEXELS_API_KEY } },
    )

    if (!firstRes.ok) {
      console.error(`[Pexels] API 에러: ${firstRes.status} ${firstRes.statusText}`)
      return null
    }

    const firstData = await firstRes.json()
    const totalResults = Math.min(firstData.total_results || 0, 500) // Pexels는 최대 ~8000 페이지까지

    if (totalResults === 0) {
      console.log(`[Pexels] '${keyword}' 검색 결과 없음`)
      return null
    }

    // 2단계: 랜덤 페이지에서 15장 가져오기 → 랜덤 1장 선택
    const maxPage = Math.ceil(Math.min(totalResults, 300) / 15)
    const randomPage = Math.floor(Math.random() * maxPage) + 1

    const res = await fetch(
      `${PEXELS_BASE_URL}/search?query=${encodeURIComponent(keyword)}&per_page=15&page=${randomPage}`,
      { headers: { Authorization: PEXELS_API_KEY } },
    )

    if (!res.ok) return null
    const data = await res.json()
    const photos = data.photos || []

    if (photos.length === 0) return null

    // 랜덤 1장 선택
    const photo = photos[Math.floor(Math.random() * photos.length)]

    return {
      url: photo.src.medium,                            // ~350px 폭
      originalUrl: photo.src.large2x || photo.src.original,  // 라이트박스용
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      credit: `${photo.photographer} · Pexels`,
    }
  } catch (err: any) {
    console.error(`[Pexels] 검색 실패:`, err?.message)
    return null
  }
}
