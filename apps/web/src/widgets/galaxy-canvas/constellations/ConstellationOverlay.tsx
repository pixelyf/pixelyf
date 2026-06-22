'use client'

import React, { useRef, useEffect, useState } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'

interface ConstellationOverlayProps {
  coordX: number
  coordY: number
  radius?: number
  children: React.ReactNode
}

/**
 * PixiJS의 2D 뷰포트 좌표계와 일치시켜 HTML 컨테이너(Three.js 캔버스 등)를 
 * 해당 우주 좌표 위에 오버레이합니다.
 */
export function ConstellationOverlay({ coordX, coordY, radius = 500, children }: ConstellationOverlayProps) {
  const viewport = useGalaxyStore((state) => state.viewport)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // 창 크기 추적 (캔버스 중앙 정렬용)
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // 화면 크기가 로드되기 전에는 렌더링 방지
  if (dimensions.width === 0) return null

  // PixiJS 카메라 변환 공식 적용: Screen = (World - Camera) * Zoom + Screen/2
  const screenX = (coordX - viewport.x) * viewport.zoom + dimensions.width / 2
  const screenY = (coordY - viewport.y) * viewport.zoom + dimensions.height / 2
  
  // 줌에 따른 크기 스케일링
  const scaledSize = radius * 2 * viewport.zoom

  // 화면 바깥으로 멀리 나간 경우 렌더링 최적화 (Culling)
  const isVisible = 
    screenX + scaledSize / 2 > 0 &&
    screenX - scaledSize / 2 < dimensions.width &&
    screenY + scaledSize / 2 > 0 &&
    screenY - scaledSize / 2 < dimensions.height

  if (!isVisible) return null

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-none"
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        width: `${scaledSize}px`,
        height: `${scaledSize}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
        // 디버깅/구분용 테두리 (테스트용)
        // border: '1px solid rgba(255, 255, 255, 0.2)',
        // borderRadius: '50%'
      }}
    >
      {/* 내부의 3D 캔버스 영역에만 마우스 이벤트 허용 */}
      <div className="w-full h-full pointer-events-auto">
        {children}
      </div>
    </div>
  )
}
