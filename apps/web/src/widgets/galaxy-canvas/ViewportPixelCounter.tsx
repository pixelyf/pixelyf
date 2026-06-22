'use client'

import { useEffect, useState } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'

export function ViewportPixelCounter() {
  const spatialGrid = useGalaxyStore((s) => s.spatialGrid)
  const viewport = useGalaxyStore((s) => s.viewport)
  const isPixiReady = useGalaxyStore((s) => s.isPixiReady)
  const viewMode = useGalaxyStore((s) => s.viewMode)

  const [pixelCount, setPixelCount] = useState(0)

  useEffect(() => {
    if (!isPixiReady || !spatialGrid || viewMode !== 'pixelyer') {
      setPixelCount(0)
      return
    }

    const calculateCount = () => {
      const wW = window.innerWidth
      const wH = window.innerHeight
      const zoom = viewport.zoom

      const halfW = (wW / 2) / zoom
      const halfH = (wH / 2) / zoom

      const minX = viewport.x - halfW
      const maxX = viewport.x + halfW
      const minY = viewport.y - halfH
      const maxY = viewport.y + halfH

      // 뷰포트 영역 내의 픽셀들 질의
      const pixels = spatialGrid.query(minX, maxX, minY, maxY)

      // 대략적인 쿼리 버퍼에서 실제 화면에 들어오는 픽셀들만 정밀 필터링
      const inViewportPixels = pixels.filter((p) => {
        const px = p.coordX
        const py = p.coordY
        return px >= minX && px <= maxX && py >= minY && py <= maxY
      })

      setPixelCount(inViewportPixels.length)
    }

    calculateCount()

    window.addEventListener('resize', calculateCount)
    return () => window.removeEventListener('resize', calculateCount)
  }, [spatialGrid, viewport, isPixiReady, viewMode])

  if (viewMode !== 'pixelyer' || !isPixiReady) return null

  return (
    <div
      data-tour="viewport-pixel-count"
      className="fixed bottom-6 left-6 z-40 pointer-events-auto select-none flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all duration-300 animate-in fade-in"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
      <span className="text-[10px] font-extrabold tracking-wider text-slate-300/80">VIEWPORT PIXELS:</span>
      <span className="text-xs font-black text-emerald-400 font-mono">{pixelCount}</span>
    </div>
  )
}
