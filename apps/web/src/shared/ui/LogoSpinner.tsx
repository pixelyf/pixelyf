import React from 'react'

interface LogoSpinnerProps {
  size?: number
  className?: string
  variant?: 'brand' | 'white'
  color?: string
}

export function LogoSpinner({ size = 48, className = '', variant = 'brand', color }: LogoSpinnerProps) {
  const strokeColor = color || (variant === 'white' ? '#ffffff' : '#A855F7')
  // size가 작아질수록 선명도(안티앨리어싱 붕괴 방지)를 위해 strokeWidth의 비율을 높입니다.
  const strokeWidth = size < 20 ? 12 : size < 32 ? 8 : 3.5

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* [GPU ONLY] transform: rotate() + opacity만 사용 → 절대 멈추지 않음 */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full animate-spinner-rotate overflow-visible"
      >
        <rect
          x="20"
          y="20"
          width="60"
          height="60"
          rx="9"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="animate-spinner-breathe"
        />
        {/* 로고 중앙 점 */}
        <circle
          cx="50"
          cy="50"
          r={size < 20 ? 8 : size < 32 ? 6 : 4}
          fill={strokeColor}
          className="animate-spinner-breathe"
        />
      </svg>
    </div>
  )
}
