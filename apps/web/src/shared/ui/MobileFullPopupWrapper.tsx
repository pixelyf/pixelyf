'use client'

import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { isNativeApp } from '@/shared/utils/isNativeApp'
import { requestHideTabBar, requestShowTabBar } from '@/shared/lib/bridge'

interface MobileFullPopupWrapperProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: React.ReactNode
  transitionType?: 'slide-in' | 'slide-up'
  className?: string
  style?: React.CSSProperties
  desktopWidth?: number | string
  desktopStyle?: React.CSSProperties
  desktopClassName?: string
  isResizing?: React.MutableRefObject<boolean>
  resizeHandle?: React.ReactNode
  // 모바일 전용
  onSwipeClose?: () => void
}

export function MobileFullPopupWrapper({
  isOpen,
  onClose,
  children,
  title,
  transitionType = 'slide-in',
  className = '',
  style = {},
  desktopWidth = 520,
  desktopStyle = {},
  desktopClassName = '',
  resizeHandle,
  onSwipeClose,
}: MobileFullPopupWrapperProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isNative = isNativeApp()

  // ── [MOBILE APP] 하이브리드 네이티브 탭바 제어 생명주기 바인딩 ──
  const hasTabBarHidden = useRef(false)
  useEffect(() => {
    if (!isMobile || !isNative) return

    if (isOpen && !hasTabBarHidden.current) {
      hasTabBarHidden.current = true
      requestHideTabBar()
    } else if (!isOpen && hasTabBarHidden.current) {
      hasTabBarHidden.current = false
      requestShowTabBar()
    }

    return () => {
      if (hasTabBarHidden.current) {
        hasTabBarHidden.current = false
        requestShowTabBar()
      }
    }
  }, [isOpen, isMobile, isNative])

  // 데스크톱 렌더링 (기존 사이드 드로어 구조 그대로 유지)
  if (!isMobile) {
    return (
      <motion.div
        animate={{ width: isOpen ? desktopWidth : 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        style={{
          position: 'relative',
          height: '100%',
          flexShrink: 0,
          overflow: 'visible',
          pointerEvents: 'auto',
          width: isOpen ? desktopWidth : 0,
          zIndex: 70,
          ...desktopStyle,
        }}
        className={desktopClassName}
      >
        {resizeHandle}
        <div className="h-full w-full flex flex-col overflow-hidden">
          {children}
        </div>
      </motion.div>
    )
  }

  // 모바일 풀팝업 Motion Variants
  const variants = {
    'slide-in': {
      initial: { x: '100%', opacity: 1 },
      animate: { x: 0, opacity: 1 },
      exit: { x: '100%', opacity: 1 },
    },
    'slide-up': {
      initial: { y: '100%', opacity: 1 },
      animate: { y: 0, opacity: 1 },
      exit: { y: '100%', opacity: 1 },
    },
  }

  const selectedVariant = variants[transitionType]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 어두운 뒷배경 오버레이 (Dimmer) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[49] pointer-events-auto"
          />

          {/* 모바일 팝업 본체 */}
          <motion.div
            initial={selectedVariant.initial}
            animate={selectedVariant.animate}
            exit={selectedVariant.exit}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onTouchStart={(e) => {
              if (transitionType !== 'slide-in') return
              const target = e.target as HTMLElement
              // 가로 스크롤 가능 영역(탭바, 가로형 스크롤 등)에서는 스와이프 트리거하지 않음
              if (target.closest('.overflow-x-auto, .no-scrollbar, [role="tablist"]')) {
                ;(e.currentTarget as any)._swipeStart = null
                return
              }
              const touch = e.touches[0]
              ;(e.currentTarget as any)._swipeStart = { x: touch.clientX, y: touch.clientY }
            }}
            onTouchEnd={(e) => {
              if (transitionType !== 'slide-in') return
              const start = (e.currentTarget as any)._swipeStart
              if (!start) return
              const touch = e.changedTouches[0]
              const dx = touch.clientX - start.x
              const dy = Math.abs(touch.clientY - start.y)
              // 좌 -> 우 80px 이상 스와이프 시 닫기
              if (dx > 80 && dx > dy) {
                if (onSwipeClose) onSwipeClose()
                else onClose()
              }
            }}
            style={{
              position: 'fixed',
              inset: transitionType === 'slide-up' ? 'auto 0 0 0' : 0,
              zIndex: 50,
              ...style,
            }}
            className={`theme-panel-bg text-theme-primary h-full backdrop-blur-3xl pointer-events-auto flex flex-col shadow-2xl overflow-hidden ${
              transitionType === 'slide-up' ? 'rounded-t-3xl max-h-[70vh] border-t border-white/10' : ''
            } ${className}`}
          >
            <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
