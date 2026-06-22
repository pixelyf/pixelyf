'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'

/**
 * CSS 미디어쿼리를 React 상태로 추적하는 훅.
 * SSR 안전: 서버에서는 항상 false를 반환하고,
 * 클라이언트에서는 useSyncExternalStore로 즉시 올바른 값을 반환하여
 * false→true 전환으로 인한 레이아웃 플래시/리마운트를 방지.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    if (typeof window === 'undefined') return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener('change', callback)
    return () => mql.removeEventListener('change', callback)
  }

  const getSnapshot = () => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  }

  const getServerSnapshot = () => false

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
