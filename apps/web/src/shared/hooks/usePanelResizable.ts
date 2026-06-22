'use client'

import { useCallback, useRef } from 'react'

interface UsePanelResizableParams {
  currentWidth: number
  onWidthChange: (width: number) => void
  minWidth?: number
  maxWidth?: number
  direction?: 'left' | 'right'
}

/**
 * usePanelResizable
 * 데스크탑 사이드 드로어 패널의 가로 폭 리사이즈 드래그 이벤트를 공통 제어하는 훅입니다.
 * 드래그 성능 최적화를 위해 onPointerMove 중에는 DOM style.width를 직접 변경하고,
 * onPointerUp 완료 시 최종 너비를 상태(onWidthChange)로 전달하여 리렌더링 부하를 예방합니다.
 */
export function usePanelResizable({
  currentWidth,
  onWidthChange,
  minWidth = 380,
  maxWidth = 700,
  direction = 'left',
}: UsePanelResizableParams) {
  const isDraggingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const startX = e.clientX
    const startWidth = currentWidth

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return
      
      // 좌측 드래그(left) 시 너비 증가(startX - clientX), 우측 드래그(right) 시 너비 증가(clientX - startX)
      const deltaX = direction === 'left' ? startX - ev.clientX : ev.clientX - startX
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX))
      
      if (panelRef.current) {
        panelRef.current.style.width = `${newWidth}px`
      }
    }

    const onUp = (ev: PointerEvent) => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)

      const deltaX = direction === 'left' ? startX - ev.clientX : ev.clientX - startX
      const finalWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX))
      onWidthChange(finalWidth)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [currentWidth, onWidthChange, minWidth, maxWidth, direction])

  return {
    panelRef,
    handleResizeStart,
    isDragging: isDraggingRef,
  }
}
