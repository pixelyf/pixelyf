'use client'

import React, { ButtonHTMLAttributes } from 'react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'

export interface ModalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 버튼 스타일 (기본: solid) */
  variant?: 'solid' | 'glass'
  /** 로딩 상태 */
  isLoading?: boolean
  /** 가로 100% 여부 */
  fullWidth?: boolean
  /** 왼쪽 아이콘 */
  leftIcon?: React.ReactNode
  /** 오른쪽 아이콘 */
  rightIcon?: React.ReactNode
}

/**
 * [공통 팝업 하단 버튼]
 * 팝업(모달) 하단 액션 버튼의 사이즈, 여백, 로딩 상태를 모두 통일하는 컴포넌트입니다.
 */
export function ModalButton({
  variant = 'solid',
  isLoading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  disabled,
  ...props
}: ModalButtonProps) {
  const isSolid = variant === 'solid'
  const baseClass = isSolid ? 'theme-btn-solid' : 'theme-btn-glass'
  
  // theme-btn-glass는 기본이 rounded-full이므로, 모달 하단용으로 rounded-xl을 강제 주입
  const roundedClass = isSolid ? 'rounded-xl' : '!rounded-xl'

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClass} ${fullWidth ? 'w-full' : ''} flex items-center justify-center gap-2 px-4 py-3 text-sm ${roundedClass} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {isLoading ? (
        <LogoSpinner size={16} />
      ) : (
        <>
          {leftIcon}
          {children && <span>{children}</span>}
          {rightIcon}
        </>
      )}
    </button>
  )
}
