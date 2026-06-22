'use client'

import React, { useState, useEffect, useRef, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

interface PortalTooltipProps {
  content: React.ReactNode
  children: React.ReactElement<any>
  className?: string
  delay?: number
}

export function PortalTooltip({
  content,
  children,
  className = '',
  delay = 75,
}: PortalTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLElement | null>(null)
  const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current)
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current)
    }
  }, [])

  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // 툴팁을 트리거의 가로 중앙 위에 정렬
    const left = rect.left + rect.width / 2 + window.scrollX
    const top = rect.top + window.scrollY
    setCoords({ top, left })
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }

    // 마우스가 들어간 요소 혹은 수동 지정한 ref
    triggerRef.current = e.currentTarget as HTMLElement
    updatePosition()

    enterTimeoutRef.current = setTimeout(() => {
      // 위치 재측정 (레이아웃 변동 고려)
      updatePosition()
      setIsVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (enterTimeoutRef.current) {
      clearTimeout(enterTimeoutRef.current)
      enterTimeoutRef.current = null
    }

    leaveTimeoutRef.current = setTimeout(() => {
      setIsVisible(false)
    }, 100)
  }

  // 트리거 엘리먼트에 이벤트 주입
  const trigger = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      if (children.props.onMouseEnter) children.props.onMouseEnter(e)
      handleMouseEnter(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      if (children.props.onMouseLeave) children.props.onMouseLeave(e)
      handleMouseLeave()
    },
  })

  // SSR 하이드레이션 오류 방지
  if (!mounted) {
    return children
  }

  return (
    <>
      {trigger}
      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <div
              style={{
                position: 'absolute',
                top: coords.top - 8,
                left: coords.left,
                transform: 'translate(-50%, -100%)',
                zIndex: 9999,
                pointerEvents: 'none',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.12 }}
                className={`
                  pointer-events-none z-[9999] shadow-[0_10px_30px_rgba(0,0,0,0.5)]
                  bg-slate-950/95 border border-white/10 text-white
                  after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2
                  after:border-[5px] after:border-transparent after:border-t-slate-950/95
                  ${className}
                `}
              >
                {content}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
