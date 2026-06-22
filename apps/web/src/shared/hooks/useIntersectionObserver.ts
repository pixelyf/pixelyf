import { useRef, useEffect, useCallback } from 'react'

/**
 * [PANEL CRUD] IntersectionObserver 기반 무한 스크롤 감지 훅
 * 외부 라이브러리(react-query) 없이 안정적인 무한 스크롤 구현
 * 
 * @usage
 * ```tsx
 * const { sentinelRef } = useIntersectionObserver({
 *   onIntersect: () => loadNextPage(),
 *   enabled: hasMore && !isLoading,
 * })
 * 
 * return (
 *   <div>
 *     {items.map(...)}
 *     <div ref={sentinelRef} /> // 이 요소가 화면에 보이면 onIntersect 호출
 *   </div>
 * )
 * ```
 */
interface UseIntersectionObserverOptions {
  /** 뷰포트에 진입했을 때 호출될 콜백 */
  onIntersect: () => void
  /** false이면 감지 비활성화 (로딩 중이거나 더 이상 데이터가 없을 때) */
  enabled?: boolean
  /** 루트 마진 (뷰포트 하단 n px 전에 미리 감지) */
  rootMargin?: string
  /** 교차 비율 임계값 (0.0 ~ 1.0) */
  threshold?: number
}

export function useIntersectionObserver({
  onIntersect,
  enabled = true,
  rootMargin = '200px',
  threshold = 0.1,
}: UseIntersectionObserverOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const callbackRef = useRef(onIntersect)

  // 콜백 레퍼런스를 항상 최신으로 유지 (stale closure 방지)
  useEffect(() => {
    callbackRef.current = onIntersect
  }, [onIntersect])

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callbackRef.current()
        }
      },
      { rootMargin, threshold }
    )

    observer.observe(sentinelRef.current)

    return () => observer.disconnect()
  }, [enabled, rootMargin, threshold])

  return { sentinelRef }
}
