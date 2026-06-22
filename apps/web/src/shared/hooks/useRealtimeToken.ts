/**
 * useRealtimeToken — Supabase Realtime 토큰 관리 훅
 *
 * postgres_changes 구독에 필요한 custom JWT를 관리합니다.
 * - 최초 발급 1회 (싱글턴 패턴)
 * - JWT 만료 5분 전 자동 갱신
 * - 발급 실패 시 anon 모드 폴백 (broadcast는 동작, postgres_changes는 불가)
 *
 * 참조: miniFlea 프로덕션 검증 패턴
 */

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/shared/lib/supabase/browser'

const TAG = '[RealtimeToken]'

/** JWT payload에서 exp 추출 (ms 단위) */
function getJwtExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(atob(payload))
    if (typeof decoded.exp === 'number') {
      return decoded.exp * 1000 // seconds → ms
    }
    return null
  } catch {
    return null
  }
}

// ============================================
// 모듈 레벨 싱글턴 상태
// ============================================

let _tokenPromise: Promise<string | null> | null = null
let _currentToken: string | null = null
let _renewalTimer: ReturnType<typeof setTimeout> | null = null
let _subscriberCount = 0

/** 토큰 발급 (또는 갱신) */
async function fetchAndSetToken(): Promise<string | null> {
  try {
    console.info(TAG, '🔑 Realtime 토큰 발급 시작...')
    const res = await fetch('/api/dm/realtime-token')

    if (!res.ok) {
      console.warn(TAG, '🔑 토큰 발급 실패 — anon 모드')
      return null
    }

    const json = await res.json()

    if (json?.data?.token) {
      const token = json.data.token
      const supabase = createClient()
      supabase.realtime.setAuth(token)
      _currentToken = token
      console.info(TAG, '🔑 Realtime 토큰 설정 완료')
      scheduleRenewal(token)
      return token
    }

    console.warn(TAG, '🔑 토큰 없음 — anon 모드')
    return null
  } catch (error) {
    console.warn(TAG, '🔑 토큰 발급 실패 — anon 모드', error)
    return null
  }
}

/** 만료 5분 전에 자동 갱신 예약 */
function scheduleRenewal(token: string): void {
  if (_renewalTimer) {
    clearTimeout(_renewalTimer)
    _renewalTimer = null
  }

  const expMs = getJwtExpMs(token)
  if (!expMs) {
    // exp 파싱 실패 → 50분 후 갱신 (기본 1시간 토큰 가정)
    console.info(TAG, '⏰ exp 파싱 실패 — 50분 후 갱신 예약')
    _renewalTimer = setTimeout(renewToken, 50 * 60 * 1000)
    return
  }

  const now = Date.now()
  const ttlMs = expMs - now
  // 만료 5분 전 또는 최소 30초 후
  const renewInMs = Math.max(ttlMs - 5 * 60 * 1000, 30 * 1000)

  console.info(TAG, `⏰ 토큰 갱신 예약: ${Math.round(renewInMs / 60000)}분 후`)
  _renewalTimer = setTimeout(renewToken, renewInMs)
}

/** 토큰 갱신 실행 */
async function renewToken(): Promise<void> {
  if (_subscriberCount <= 0) {
    console.info(TAG, '🔄 구독자 없음 — 갱신 스킵')
    return
  }

  console.info(TAG, '🔄 토큰 자동 갱신 시작...')
  _tokenPromise = fetchAndSetToken()
  await _tokenPromise
}

/** 정리 */
function cleanup(): void {
  if (_renewalTimer) {
    clearTimeout(_renewalTimer)
    _renewalTimer = null
  }
  _tokenPromise = null
  _currentToken = null
}

// ============================================
// Hook
// ============================================

/**
 * Realtime 토큰 공유 훅
 *
 * @returns tokenReady — 토큰 발급 완료 (또는 anon 폴백) 여부
 */
export function useRealtimeToken(enabled: boolean = true): { tokenReady: boolean } {
  const [tokenReady, setTokenReady] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!enabled) return

    _subscriberCount++

    // 이미 토큰이 있으면 바로 ready
    if (_currentToken) {
      setTokenReady(true)
      return () => {
        _subscriberCount--
        if (_subscriberCount <= 0) cleanup()
      }
    }

    // 이미 진행 중인 요청이 있으면 대기
    if (!_tokenPromise) {
      _tokenPromise = fetchAndSetToken()
    }

    _tokenPromise.then(() => {
      if (mountedRef.current) setTokenReady(true)
    })

    return () => {
      _subscriberCount--
      if (_subscriberCount <= 0) cleanup()
    }
  }, [enabled])

  return { tokenReady }
}
