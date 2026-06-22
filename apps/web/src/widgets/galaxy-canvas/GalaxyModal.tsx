import React, { useEffect, useRef } from 'react'
import { useDialogStore } from '@/stores/dialogStore'

export interface GalaxyModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '4xl' | '5xl'
  zIndex?: number
  className?: string
  hideBackdropBlur?: boolean
  /** 모달 제목 (aria-labelledby 연결용 ID) */
  ariaLabelledBy?: string
  /** 모바일에서 여백 없이 풀스크린 적용 여부 */
  fullScreenOnMobile?: boolean
  /** 테마 변수 상속 스타일 주입 */
  style?: React.CSSProperties
}

export function GalaxyModal({
  isOpen,
  onClose,
  children,
  size = 'md',
  zIndex = 100,
  className = '',
  hideBackdropBlur = false,
  ariaLabelledBy,
  fullScreenOnMobile = false,
  style,
}: GalaxyModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // ── ESC 키 닫기 ──
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 커스텀 다이얼로그가 열려있으면 모달은 닫지 않음 (다이얼로그가 우선)
        if (useDialogStore.getState().dialogs.length > 0) return
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // ── Focus Trap ──
  useEffect(() => {
    if (!isOpen || !modalRef.current) return
    const modal = modalRef.current
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

    // 열릴 때 모달 내부 첫 번째 포커서블 요소에 포커스
    requestAnimationFrame(() => {
      const first = modal.querySelector<HTMLElement>(focusableSelector)
      first?.focus()
    })

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = modal.querySelectorAll<HTMLElement>(focusableSelector)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [isOpen])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  }

  return (
    <div 
      className={`fixed inset-0 flex items-center justify-center ${fullScreenOnMobile ? 'p-0 md:p-4' : 'p-4'} pointer-events-auto`}
      style={{ zIndex }}
    >
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/80 animate-in fade-in ${!hideBackdropBlur ? 'backdrop-blur-sm' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          // onClose() // [UI 공통화] 배경 클릭 시 팝업이 닫히지 않도록 정책 통일
        }}
      />
      
      {/* Modal Container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        style={style}
        className={`relative w-full ${sizeClasses[size]} theme-panel-bg border border-white/10 ${fullScreenOnMobile ? 'rounded-none md:rounded-3xl h-[100dvh] md:h-auto' : 'rounded-3xl'} shadow-2xl animate-in zoom-in-95 overflow-hidden ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
