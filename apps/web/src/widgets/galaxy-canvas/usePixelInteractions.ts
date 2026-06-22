'use client'

/**
 * usePixelInteractions — Touch/Ping 인터랙션 핸들러
 *
 * [아키텍처] PixelDetailDrawer에서 추출된 도메인 훅.
 * Touch 전송, Ping 발송, Ping 취소 로직을 포함.
 * setFeedMoments를 DI로 주입받아 낙관적 UI 업데이트 수행.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { usePingStore } from '@/stores/pingStore'
import { usePulseStore } from '@/stores/pulseStore'
import { useToastStore } from '@/stores/toastStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useTranslations } from 'next-intl'
import type { FeedItem } from './SearchFeedDrawer'
import { TOUCH_COOLDOWN_MS } from '@/shared/constants/touches'
import { useMoodColor } from '@/shared/hooks/useMoodColor'

interface UsePixelInteractionsParams {
  selectedPixelId: string | null
  setFeedMoments: React.Dispatch<React.SetStateAction<FeedItem[]>>
  pixel: any
}

export function usePixelInteractions({
  selectedPixelId,
  setFeedMoments,
  pixel,
}: UsePixelInteractionsParams) {
  const t = useTranslations('Pixel')
  const userProfile = useUserStore(s => s.user)
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const momentPings = usePingStore(s => s.momentPings)
  const momentIsPinging = usePingStore(s => s.momentIsPinging)
  const activePingMomentId = usePingStore(s => s.activePingMomentId)
  const addPulse = usePulseStore(s => s.addPulse)
  const addToast = useToastStore(s => s.addToast)

  // 생각 상태 컬러 획득
  const moodColor = useMoodColor(pixel?.moodId || 'neutral')

  // 토스트 출력용 유틸 함수
  const showToast = useCallback((msg: string) => {
    addToast({
      title: t.has('notification') ? t('notification') : '알림',
      message: msg,
      type: 'info',
    })
  }, [addToast, t])

  // ── Touch 상태 ──
  const [touchCount, setTouchCount] = useState(0)
  const [isTouchSending, setIsTouchSending] = useState(false)
  const [touchCooldown, setTouchCooldown] = useState(false)

  // 12시간 로컬스토리지 락 검사 및 상태 업데이트 헬퍼
  const updateTouchCooldownState = useCallback(() => {
    if (!selectedPixelId) {
      setTouchCooldown(false)
      return
    }
    const lastTouchKey = `last_touch_${selectedPixelId}`
    const lastTouchTime = typeof window !== 'undefined' ? localStorage.getItem(lastTouchKey) : null
    if (lastTouchTime) {
      const elapsed = Date.now() - parseInt(lastTouchTime, 10)
      setTouchCooldown(elapsed < TOUCH_COOLDOWN_MS)
    } else {
      setTouchCooldown(false)
    }
  }, [selectedPixelId])

  const touchSent = touchCooldown

  // ── Ping 상태 ──
  const [isPingPanelOpen, setIsPingPanelOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sentPingId, setSentPingId] = useState<string | null>(null)

  // [NEW] 픽셀 전환(selectedPixelId 변경) 시 개별 픽셀 인터랙션 로컬 상태 리셋
  useEffect(() => {
    setTouchCount(0)
    setIsTouchSending(false)
    setIsPingPanelOpen(false)
    setIsSending(false)
    setSentPingId(null)
    updateTouchCooldownState()
  }, [selectedPixelId, updateTouchCooldownState])

  // ── Touch 전송 핸들러 ──
  const handleTouch = async () => {
    if (!userProfile || !selectedPixelId || isTouchSending) return

    // 12시간 로컬스토리지를 활용한 락 가로채기 (API 호출 원천 차단 및 생각 상태 컬러 토스트 출력)
    const lastTouchKey = `last_touch_${selectedPixelId}`
    const lastTouchTime = localStorage.getItem(lastTouchKey)
    
    if (lastTouchTime) {
      const elapsed = Date.now() - parseInt(lastTouchTime, 10)
      if (elapsed < TOUCH_COOLDOWN_MS) {
        addToast({
          title: t.has('touchCooldown') ? t('touchCooldown') : '터치 제한',
          message: t.has('touchCooldownMessage') ? t('touchCooldownMessage') : '잠시 후 다시 터치해주세요.',
          type: 'info',
          style: { backgroundColor: moodColor.primaryHex, color: 'white', border: 'none' }
        })
        return
      }
    }

    if (touchCooldown || touchSent) {
      addToast({
        title: t.has('touchCooldown') ? t('touchCooldown') : '터치 제한',
        message: t.has('touchCooldownMessage') ? t('touchCooldownMessage') : '잠시 후 다시 터치해주세요.',
        type: 'info',
        style: { backgroundColor: moodColor.primaryHex, color: 'white', border: 'none' }
      })
      return
    }

    setIsTouchSending(true)
    setTouchCount(c => c + 1)

    window.dispatchEvent(new CustomEvent('pixel-updated', {
      detail: { pixelId: selectedPixelId, field: 'touchCount', delta: 1 }
    }))

    try {
      const res = await fetch('/api/touches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touchedId: selectedPixelId, galaxyKey })
      })
      if (!res.ok) {
        setTouchCount(c => c - 1)
        window.dispatchEvent(new CustomEvent('pixel-updated', {
          detail: { pixelId: selectedPixelId, field: 'touchCount', delta: -1 }
        }))
        
        // 12시간 쿨타임 에러(429) 처리 분기
        if (res.status === 429) {
          // 로컬스토리지 락 즉시 동기화
          localStorage.setItem(lastTouchKey, Date.now().toString())
          setTouchCooldown(true)
          
          addToast({
            title: t('touchCooldown') || '터치 제한',
            message: t('touchCooldownMessage') || '잠시 후 다시 터치해주세요.',
            type: 'info',
            style: { backgroundColor: moodColor.primaryHex, color: 'white', border: 'none' }
          })
          console.warn('[Touch] Cooldown sync with server (12 hours lock)')
        } else {
          console.error('[Touch] API Error:', await res.text())
        }
      } else {
        // 성공 시 로컬스토리지에 마지막 터치 시각 마킹
        localStorage.setItem(lastTouchKey, Date.now().toString())
        setTouchCooldown(true)
      }
    } catch (e) {
      setTouchCount(c => c - 1)
      window.dispatchEvent(new CustomEvent('pixel-updated', {
        detail: { pixelId: selectedPixelId, field: 'touchCount', delta: -1 }
      }))
      console.error('[Touch] Network Error:', e)
    } finally {
      setIsTouchSending(false)
    }
  }

  // ── Ping 발송 ──
  const handlePingSelect = async (pingId: string, targetMomentId?: string) => {
    if (!userProfile || !selectedPixelId || !targetMomentId) return



    if (momentIsPinging[targetMomentId]) return

    usePingStore.getState().setMomentIsPinging(targetMomentId, true)
    // [개선] 핑 레이어 내부에서 로딩 스피너를 보여주도록 즉각 닫지 않고 대기합니다.
    // setIsPingPanelOpen(false)
    // usePingStore.getState().setActivePingMomentId(null)

    // 낙관적 UI (상세 카운터 camel/snake 2중 갱신)
    setFeedMoments(prev => prev.map(m => {
      if ((m.momentId || m.id) === targetMomentId) {
        const newCountsSnake = { ...(m.ping_type_counts || {}) }
        newCountsSnake[pingId] = (newCountsSnake[pingId] || 0) + 1

        const newCountsCamel = { ...(m.pingTypeCounts || {}) }
        newCountsCamel[pingId] = (newCountsCamel[pingId] || 0) + 1

        return { 
          ...m, 
          ping_count: (m.ping_count || 0) + 1, 
          pings: (m.pings || 0) + 1,
          ping_type_counts: newCountsSnake,
          pingTypeCounts: newCountsCamel
        }
      }
      return m
    }))
    usePingStore.getState().setMomentPing(targetMomentId, pingId)

    // 전역 스토어 targetFeedItem 낙관적 동기화 (상세 카운터 포함)
    const currentTarget = useGalaxyStore.getState().targetFeedItem
    if (currentTarget && (currentTarget.momentId === targetMomentId || currentTarget.id === targetMomentId)) {
      const newCountsSnake = { ...(currentTarget.ping_type_counts || {}) }
      newCountsSnake[pingId] = (newCountsSnake[pingId] || 0) + 1

      const newCountsCamel = { ...(currentTarget.pingTypeCounts || {}) }
      newCountsCamel[pingId] = (newCountsCamel[pingId] || 0) + 1

      useGalaxyStore.getState().setTargetFeedItem({
        ...currentTarget,
        pings: (currentTarget.pings || 0) + 1,
        ping_count: (currentTarget.ping_count || 0) + 1,
        ping_type_counts: newCountsSnake,
        pingTypeCounts: newCountsCamel
      })
    }

    // 시각적 황금빛 PING 궤적
    const spatialGrid = useGalaxyStore.getState().spatialGrid
    const currentMoodId = useGalaxyStore.getState().currentMoodId
    const userPixel = spatialGrid?.getPixel(userProfile?.id || '')

    window.dispatchEvent(new CustomEvent('optimistic-feed-update', {
      detail: { 
        pixelId: selectedPixelId, 
        momentId: targetMomentId, 
        field: 'pings', 
        delta: 1, 
        pingId: pingId, 
        isCancel: false 
      }
    }));
    addPulse({
      id: `ping-${Date.now()}`,
      content: '',
      user_id: userProfile?.id || 'guest_id',
      images: null,
      created_at: new Date().toISOString(),
      mood_id: 'ping',
      aura_at_post: 'ENERGY',
      coord: { x: userPixel?.coordX || 0, y: userPixel?.coordY || 0 },
      user: {
        display_name: userProfile?.display_name || 'Guest',
        avatar_svg_id: userProfile?.avatar_url || '01',
        current_mood_id: currentMoodId
      }
    })

    try {
      const res = await fetch('/api/pings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: selectedPixelId,
          pingType: pingId,
          momentId: targetMomentId,
          galaxyKey,
        })
      })
      if (!res.ok) {
        // 실패 시 롤백 (2중 카운터 및 총합 복구)
        setFeedMoments(prev => prev.map(m => {
          if ((m.momentId || m.id) === targetMomentId) {
            const newCountsSnake = { ...(m.ping_type_counts || {}) }
            newCountsSnake[pingId] = Math.max(0, (newCountsSnake[pingId] || 0) - 1)

            const newCountsCamel = { ...(m.pingTypeCounts || {}) }
            newCountsCamel[pingId] = Math.max(0, (newCountsCamel[pingId] || 0) - 1)

            return { 
              ...m, 
              ping_count: Math.max(0, (m.ping_count || 0) - 1), 
              pings: Math.max(0, (m.pings || 0) - 1),
              ping_type_counts: newCountsSnake,
              pingTypeCounts: newCountsCamel
            }
          }
          return m
        }))
        usePingStore.getState().removeMomentPing(targetMomentId)

        // targetFeedItem 롤백 (상세 포함)
        const fallbackTarget = useGalaxyStore.getState().targetFeedItem
        if (fallbackTarget && (fallbackTarget.momentId === targetMomentId || fallbackTarget.id === targetMomentId)) {
          const newCountsSnake = { ...(fallbackTarget.ping_type_counts || {}) }
          newCountsSnake[pingId] = Math.max(0, (newCountsSnake[pingId] || 0) - 1)

          const newCountsCamel = { ...(fallbackTarget.pingTypeCounts || {}) }
          newCountsCamel[pingId] = Math.max(0, (newCountsCamel[pingId] || 0) - 1)

          useGalaxyStore.getState().setTargetFeedItem({
            ...fallbackTarget,
            pings: Math.max(0, (fallbackTarget.pings || 0) - 1),
            ping_count: Math.max(0, (fallbackTarget.ping_count || 0) - 1),
            ping_type_counts: newCountsSnake,
            pingTypeCounts: newCountsCamel
          })
        }

        // UFIP 통합 롤백 디스패치 전파 (검색 판넬 & 캔버스 롤백 반영)
        window.dispatchEvent(new CustomEvent('optimistic-feed-update', {
          detail: { 
            pixelId: selectedPixelId, 
            momentId: targetMomentId, 
            field: 'pings', 
            delta: -1, 
            pingId: pingId, 
            isCancel: true 
          }
        }))

        // 에러 원본 텍스트 파싱 및 사용자 정중한 토스트 노출
        const rawText = await res.text()
        let errMsg = t.has('pingFailed') ? t('pingFailed') : '핑 전송에 실패했습니다.'
        try {
          const errJson = JSON.parse(rawText)
          if (errJson.error) errMsg = errJson.error
        } catch {}

        addToast({
          title: t.has('notification') ? t('notification') : '알림',
          message: errMsg,
          type: 'info',
          style: { backgroundColor: moodColor.primaryHex, color: 'white', border: 'none' }
        })

        console.error('[Ping] API Error:', rawText)
      }
    } catch (e) {
      setFeedMoments(prev => prev.map(m => {
        if (m.id === targetMomentId) {
          const newCountsSnake = { ...(m.ping_type_counts || {}) }
          newCountsSnake[pingId] = Math.max(0, (newCountsSnake[pingId] || 0) - 1)

          const newCountsCamel = { ...(m.pingTypeCounts || {}) }
          newCountsCamel[pingId] = Math.max(0, (newCountsCamel[pingId] || 0) - 1)

          return { 
            ...m, 
            ping_count: Math.max(0, (m.ping_count || 0) - 1), 
            pings: Math.max(0, (m.pings || 0) - 1),
            ping_type_counts: newCountsSnake,
            pingTypeCounts: newCountsCamel
          }
        }
        return m
      }))
      usePingStore.getState().removeMomentPing(targetMomentId)

      // targetFeedItem 롤백 (상세 포함)
      const fallbackTarget = useGalaxyStore.getState().targetFeedItem
      if (fallbackTarget && (fallbackTarget.momentId === targetMomentId || fallbackTarget.id === targetMomentId)) {
        const newCountsSnake = { ...(fallbackTarget.ping_type_counts || {}) }
        newCountsSnake[pingId] = Math.max(0, (newCountsSnake[pingId] || 0) - 1)

        const newCountsCamel = { ...(fallbackTarget.pingTypeCounts || {}) }
        newCountsCamel[pingId] = Math.max(0, (newCountsCamel[pingId] || 0) - 1)

        useGalaxyStore.getState().setTargetFeedItem({
          ...fallbackTarget,
          pings: Math.max(0, (fallbackTarget.pings || 0) - 1),
          ping_count: Math.max(0, (fallbackTarget.ping_count || 0) - 1),
          ping_type_counts: newCountsSnake,
          pingTypeCounts: newCountsCamel
        })
      }

      // UFIP 통합 롤백 디스패치 전파 (검색 판넬 & 캔버스 롤백 반영)
      window.dispatchEvent(new CustomEvent('optimistic-feed-update', {
        detail: { 
          pixelId: selectedPixelId, 
          momentId: targetMomentId, 
          field: 'pings', 
          delta: -1, 
          pingId: pingId, 
          isCancel: true 
        }
      }))

      addToast({
        title: t.has('notification') ? t('notification') : '알림',
        message: t.has('pingNetworkFailed') ? t('pingNetworkFailed') : '네트워크 연결이 불안정합니다.',
        type: 'info',
        style: { backgroundColor: moodColor.primaryHex, color: 'white', border: 'none' }
      })

      console.error('[Ping] Network Error:', e)
    } finally {
      usePingStore.getState().setMomentIsPinging(targetMomentId, false)
      // 핑 전송 최종 완수(또는 실패 롤백) 후 안전하게 핑 레이어를 폐쇄합니다.
      usePingStore.getState().setActivePingMomentId(null)
    }
  }

  // ── Ping 취소 ──
  const handlePingCancel = async (momentId: string) => {
    if (!selectedPixelId || momentIsPinging[momentId]) return
    const originalPingType = momentPings[momentId]

    usePingStore.getState().setMomentIsPinging(momentId, true)

    // 낙관적 UI (2중 취소 갱신)
    setFeedMoments(prev => prev.map(m => {
      if ((m.momentId || m.id) === momentId) {
        const newCountsSnake = { ...(m.ping_type_counts || {}) }
        if (originalPingType && newCountsSnake[originalPingType] > 0) {
          newCountsSnake[originalPingType] -= 1
        }

        const newCountsCamel = { ...(m.pingTypeCounts || {}) }
        if (originalPingType && newCountsCamel[originalPingType] > 0) {
          newCountsCamel[originalPingType] -= 1
        }

        return { 
          ...m, 
          ping_count: Math.max(0, (m.ping_count || 0) - 1), 
          pings: Math.max(0, (m.pings || 0) - 1),
          ping_type_counts: newCountsSnake,
          pingTypeCounts: newCountsCamel
        }
      }
      return m
    }))
    usePingStore.getState().removeMomentPing(momentId)

    // 전역 스토어 targetFeedItem 낙관적 동기화 (취소 상세 포함)
    const currentTarget = useGalaxyStore.getState().targetFeedItem
    if (currentTarget && (currentTarget.momentId === momentId || currentTarget.id === momentId)) {
      const newCountsSnake = { ...(currentTarget.ping_type_counts || {}) }
      if (originalPingType && newCountsSnake[originalPingType] > 0) {
        newCountsSnake[originalPingType] -= 1
      }

      const newCountsCamel = { ...(currentTarget.pingTypeCounts || {}) }
      if (originalPingType && newCountsCamel[originalPingType] > 0) {
        newCountsCamel[originalPingType] -= 1
      }

      useGalaxyStore.getState().setTargetFeedItem({
        ...currentTarget,
        pings: Math.max(0, (currentTarget.pings || 0) - 1),
        ping_count: Math.max(0, (currentTarget.ping_count || 0) - 1),
        ping_type_counts: newCountsSnake,
        pingTypeCounts: newCountsCamel
      })
    }

    window.dispatchEvent(new CustomEvent('optimistic-feed-update', {
      detail: { 
        pixelId: selectedPixelId, 
        momentId: momentId, 
        field: 'pings', 
        delta: -1, 
        pingId: originalPingType, 
        isCancel: true 
      }
    }));

    try {
      const res = await fetch('/api/pings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ momentId, receiverId: selectedPixelId, galaxyKey })
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('[Ping Cancel] Error:', err)
      if (originalPingType) {
        usePingStore.getState().setMomentPing(momentId, originalPingType)
      }
      setFeedMoments(prev => prev.map(m => {
        if ((m.momentId || m.id) === momentId) {
          const newCountsSnake = { ...(m.ping_type_counts || {}) }
          if (originalPingType) newCountsSnake[originalPingType] = (newCountsSnake[originalPingType] || 0) + 1

          const newCountsCamel = { ...(m.pingTypeCounts || {}) }
          if (originalPingType) newCountsCamel[originalPingType] = (newCountsCamel[originalPingType] || 0) + 1

          return { 
            ...m, 
            ping_count: (m.ping_count || 0) + 1, 
            pings: (m.pings || 0) + 1,
            ping_type_counts: newCountsSnake,
            pingTypeCounts: newCountsCamel
          }
        }
        return m
      }))

      // targetFeedItem 롤백 (상세 포함)
      const fallbackTarget = useGalaxyStore.getState().targetFeedItem
      if (fallbackTarget && (fallbackTarget.momentId === momentId || fallbackTarget.id === momentId)) {
        const newCountsSnake = { ...(fallbackTarget.ping_type_counts || {}) }
        if (originalPingType) newCountsSnake[originalPingType] = (newCountsSnake[originalPingType] || 0) + 1

        const newCountsCamel = { ...(fallbackTarget.pingTypeCounts || {}) }
        if (originalPingType) newCountsCamel[originalPingType] = (newCountsCamel[originalPingType] || 0) + 1

        useGalaxyStore.getState().setTargetFeedItem({
          ...fallbackTarget,
          pings: (fallbackTarget.pings || 0) + 1,
          ping_count: (fallbackTarget.ping_count || 0) + 1,
          ping_type_counts: newCountsSnake,
          pingTypeCounts: newCountsCamel
        })
      }

      showToast(t.has('pingCancelFailed') ? t('pingCancelFailed') : '핑 취소에 실패했습니다.')
    } finally {
      usePingStore.getState().setMomentIsPinging(momentId, false)
    }
  }

  // ── Ping 버튼 클릭 (토글) ──
  const handlePingButtonClick = (momentId: string) => {
    if (momentIsPinging[momentId]) return
    usePingStore.getState().setActivePingMomentId(activePingMomentId === momentId ? null : momentId)
  }

  // ── reset ──
  const resetInteractions = () => {
    setIsPingPanelOpen(false)
    setSentPingId(null)
  }

  return {
    // Touch
    touchCount,
    setTouchCount,
    isTouchSending,
    touchCooldown,
    touchSent,
    handleTouch,

    // Ping
    isPingPanelOpen,
    setIsPingPanelOpen,
    isSending,
    setIsSending,
    sentPingId,
    setSentPingId,
    handlePingSelect,
    handlePingCancel,
    handlePingButtonClick,

    // 유틸
    showToast,
    resetInteractions,

    // PingStore 전역 상태 (pass-through)
    momentPings,
    momentIsPinging,
    activePingMomentId,
    pingCooldown: usePingStore(s => s.pingCooldown),
  }
}
