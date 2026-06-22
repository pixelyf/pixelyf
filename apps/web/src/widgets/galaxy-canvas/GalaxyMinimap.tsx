'use client'

import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { CAMERA_ZOOM } from '@/shared/constants/camera'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { Plus, Minus, Circle, Maximize2, Minimize2, Hexagon } from 'lucide-react'
import { useTranslations } from 'next-intl'

// ─────────────────────────────────────────────────────────────────────────────
// Minimap coordinate constants
// ─────────────────────────────────────────────────────────────────────────────
const MAP_SIZE_DEFAULT = 160  // px (default rendered size)
const MAP_SIZE_EXPANDED = 280 // px (expanded mode)
const WORLD_RANGE = 16000     // planning-units shown across MAP_SIZE px (boundary ±8000)
const MIN_VP_SIZE = 16

// Zoom step multiplier for +/- buttons
const ZOOM_STEP = 1.5

// Global zoom limits (synced with galaxyStore.ts)
const MAX_ZOOM = 6.3
const MIN_ZOOM = 0.031

export function GalaxyMinimap({ partnerCode, positionClassName }: { partnerCode?: string; positionClassName?: string }) {
  const t = useTranslations('Galaxy')
  const viewport = useGalaxyStore((state) => state.viewport)
  const galaxyKey = useGalaxyStore((state) => state.galaxyKey)
  const user = useUserStore((state) => state.user)
  const [isMounted, setIsMounted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const { galaxies } = useGalaxySystem()
  const isMobile = useMediaQuery('(max-width: 767px)')

  const MAP_SIZE = isExpanded ? MAP_SIZE_EXPANDED : MAP_SIZE_DEFAULT
  const SCALE = MAP_SIZE / WORLD_RANGE

  const MINIMAP_BASES = useMemo(() => {
    const bases: Record<string, { x: number; y: number; color: string; name: string }> = {}
    galaxies?.forEach(g => {
      bases[g.key] = {
        x: g.centerX || 0,
        y: g.centerY || 0,
        color: `${g.color || '#ed1672'}59`, // hex with ~35% alpha
        name: g.name
      }
    })
    return bases
  }, [galaxies])

  useEffect(() => { setIsMounted(true) }, [])

  const nearestBaseRef = useRef({ x: 0, y: 0 })

  const dragState = useRef<{
    active: boolean
    startClientX: number
    startClientY: number
    startCamPlanX: number
    startCamPlanY: number
  } | null>(null)

  // ── 드래그 핸들러 (원본 보존: zoomDamping + DRAG_SENSITIVITY) ──
  const handleVpPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = useGalaxyStore.getState().viewport
    dragState.current = {
      active: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCamPlanX: x / VISUAL_SCALE,
      startCamPlanY: y / VISUAL_SCALE,
    }
  }, [])

  const handleVpPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current?.active) return
    e.stopPropagation()
    const dx = e.clientX - dragState.current.startClientX
    const dy = e.clientY - dragState.current.startClientY

    const currentZoom = useGalaxyStore.getState().viewport.zoom
    const zoomDamping = Math.max(0.05, currentZoom) / 0.05
    const dampedScale = SCALE * zoomDamping
    
    const DRAG_SENSITIVITY = 0.2
    const deltaPlanX = (dx / dampedScale) * DRAG_SENSITIVITY
    const deltaPlanY = (dy / dampedScale) * DRAG_SENSITIVITY

    let targetPlanX = dragState.current.startCamPlanX + deltaPlanX
    let targetPlanY = dragState.current.startCamPlanY + deltaPlanY

    // [제안 A] 미니맵 바운더리 클램핑 (스케일 박스 이탈 방지)
    const base = nearestBaseRef.current
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1000
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
    
    const vpWorldW = screenW / currentZoom / VISUAL_SCALE
    const vpWorldH = screenH / currentZoom / VISUAL_SCALE

    // 스케일 박스의 절반 크기를 빼서 박스 모서리가 맵 끝에 딱 걸리도록 연산
    const maxLimitX = Math.max(0, (WORLD_RANGE / 2) - (vpWorldW / 2))
    const maxLimitY = Math.max(0, (WORLD_RANGE / 2) - (vpWorldH / 2))

    if (targetPlanX < base.x - maxLimitX) targetPlanX = base.x - maxLimitX
    if (targetPlanX > base.x + maxLimitX) targetPlanX = base.x + maxLimitX
    if (targetPlanY < base.y - maxLimitY) targetPlanY = base.y - maxLimitY
    if (targetPlanY > base.y + maxLimitY) targetPlanY = base.y + maxLimitY

    const newX = targetPlanX * VISUAL_SCALE
    const newY = targetPlanY * VISUAL_SCALE

    useGalaxyStore.getState().setViewport({ x: newX, y: newY })
  }, [SCALE])

  const handleVpPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current?.active) return
    e.stopPropagation()
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}

    // 드래그 이동량이 3px 미만이면 '클릭'으로 간주 → 해당 위치로 이동
    const dx = e.clientX - dragState.current.startClientX
    const dy = e.clientY - dragState.current.startClientY
    const moved = Math.sqrt(dx * dx + dy * dy)

    if (moved < 3) {
      const rect = e.currentTarget.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const targetPlanX = nearestBaseRef.current.x + (localX - MAP_SIZE / 2) / SCALE
      const targetPlanY = nearestBaseRef.current.y + (localY - MAP_SIZE / 2) / SCALE
      useGalaxyStore.getState().focusOnPosition(
        targetPlanX * VISUAL_SCALE,
        targetPlanY * VISUAL_SCALE,
        useGalaxyStore.getState().viewport.zoom // 현재 줌 레벨 유지
      )
    }

    dragState.current = null
  }, [MAP_SIZE, SCALE])

  // ── 배경 클릭 → 해당 위치로 이동 (원본 보존) ──
  const handleBgPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (dragState.current?.active) return

    const rect   = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top

    const targetPlanX = nearestBaseRef.current.x + (localX - MAP_SIZE / 2) / SCALE
    const targetPlanY = nearestBaseRef.current.y + (localY - MAP_SIZE / 2) / SCALE

    useGalaxyStore.getState().focusOnPosition(
      targetPlanX * VISUAL_SCALE,
      targetPlanY * VISUAL_SCALE
    )
  }, [MAP_SIZE, SCALE])

  // ── 줌 컨트롤 핸들러 ──
  const handleZoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const current = useGalaxyStore.getState().viewport.zoom
    const newZoom = Math.min(MAX_ZOOM, current * ZOOM_STEP)
    useGalaxyStore.getState().setViewport({ zoom: newZoom })
    // 엔진에도 camera-focus 이벤트 발행 (줌만 변경, 위치 유지)
    window.dispatchEvent(new CustomEvent('camera-focus', {
      detail: {
        x: useGalaxyStore.getState().viewport.x,
        y: useGalaxyStore.getState().viewport.y,
        zoom: newZoom
      }
    }))
  }, [])

  const handleZoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const current = useGalaxyStore.getState().viewport.zoom
    const newZoom = Math.max(MIN_ZOOM, current / ZOOM_STEP)
    useGalaxyStore.getState().setViewport({ zoom: newZoom })
    window.dispatchEvent(new CustomEvent('camera-focus', {
      detail: {
        x: useGalaxyStore.getState().viewport.x,
        y: useGalaxyStore.getState().viewport.y,
        zoom: newZoom
      }
    }))
  }, [])

  const handleCenterMyPixel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) return

    // 현재 은하의 좌표 우선, 없으면 기본 좌표
    const coords = user.coordinates?.[galaxyKey]
    const myX = coords?.x ?? user.coordX ?? 0
    const myY = coords?.y ?? user.coordY ?? 0

    useGalaxyStore.getState().focusOnPosition(
      myX * VISUAL_SCALE,
      myY * VISUAL_SCALE,
      CAMERA_ZOOM.PIXEL_FOCUS,
      true
    )
  }, [user, galaxyKey])

  const handleCenterGalaxy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const core = nearestBaseRef.current
    if (!core) return

    useGalaxyStore.getState().focusOnPosition(
      core.x * VISUAL_SCALE,
      core.y * VISUAL_SCALE,
      CAMERA_ZOOM.GALAXY_OVERVIEW
    )
  }, [])

  // ── 줌 슬라이더 핸들러 (데스크탑 only) ──
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    // 슬라이더 값은 0~100 선형 → 지수 스케일로 변환
    const linearVal = Number(e.target.value)
    const zoom = MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, linearVal / 100)
    useGalaxyStore.getState().setViewport({ zoom })
    window.dispatchEvent(new CustomEvent('camera-focus', {
      detail: {
        x: useGalaxyStore.getState().viewport.x,
        y: useGalaxyStore.getState().viewport.y,
        zoom
      }
    }))
  }, [])

  // 현재 줌을 슬라이더 위치 (0~100)로 역변환
  const sliderValue = useMemo(() => {
    const logMin = Math.log(MIN_ZOOM)
    const logMax = Math.log(MAX_ZOOM)
    const logCur = Math.log(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom)))
    return ((logCur - logMin) / (logMax - logMin)) * 100
  }, [viewport.zoom])

  const overviewInfo = useMemo(() => {
    const screenW = typeof window !== 'undefined' ? window.innerWidth  : 1000
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800

    const camPlanX = viewport.x / VISUAL_SCALE
    const camPlanY = viewport.y / VISUAL_SCALE

    const domainBase = MINIMAP_BASES[galaxyKey] || Object.values(MINIMAP_BASES)[0] || { x: 0, y: 0, name: 'Unknown', color: '#FFF' }
    const nearestBase = domainBase
    const nearestGroup = domainBase.name

    nearestBaseRef.current = nearestBase

    const worldToMinimap = (worldPlanX: number, worldPlanY: number) => ({
      x: MAP_SIZE / 2 + (worldPlanX - nearestBase.x) * SCALE,
      y: MAP_SIZE / 2 + (worldPlanY - nearestBase.y) * SCALE,
    })

    const camPos = worldToMinimap(camPlanX, camPlanY)
    const corePos = worldToMinimap(nearestBase.x, nearestBase.y)

    const nebulae = Object.entries(MINIMAP_BASES).map(([id, base]) => ({
      id,
      color: base.color,
      name: base.name,
      size: isExpanded ? 60 : 40,
      pos: worldToMinimap(base.x, base.y)
    }))

    const vpWorldW = screenW / viewport.zoom / VISUAL_SCALE
    const vpWorldH = screenH / viewport.zoom / VISUAL_SCALE
    const vpRect = {
      width:  Math.max(MIN_VP_SIZE, Math.min(MAP_SIZE, vpWorldW * SCALE)),
      height: Math.max(MIN_VP_SIZE, Math.min(MAP_SIZE, vpWorldH * SCALE)),
    }

    // 내 픽셀 위치 계산
    const coords = user?.coordinates?.[galaxyKey]
    const myPlanX = coords?.x ?? user?.coordX ?? null
    const myPlanY = coords?.y ?? user?.coordY ?? null
    const myPixelPos = (myPlanX !== null && myPlanY !== null)
      ? worldToMinimap(myPlanX, myPlanY)
      : null

    return { camPos, corePos, nebulae, vpRect, myPixelPos, nearestGroup }
  }, [viewport.x, viewport.y, viewport.zoom, MAP_SIZE, SCALE, galaxyKey, MINIMAP_BASES, isExpanded, user])

  const zoomPercent = Math.round((viewport.zoom / CAMERA_ZOOM.GALAXY_OVERVIEW) * 100) + '%'

  if (!isMounted) return null

  return (
    <div data-tour="minimap" className={positionClassName || 'absolute bottom-6 right-6 pointer-events-auto flex flex-col items-end'}>
      {/* ── 타이틀 바 ── */}
      <div className="flex items-center justify-between w-full mb-1.5 px-1">
        <span className="text-[10px] font-medium tracking-wider uppercase flex items-center gap-1.5 opacity-80">
          <span className="text-hot-magenta">MAP: {overviewInfo.nearestGroup}</span>
          <span className="text-slate-500">{Math.round(viewport.x / VISUAL_SCALE)}, {Math.round(viewport.y / VISUAL_SCALE)}</span>
        </span>
        <span className="text-[10px] text-hot-magenta/80 font-mono opacity-80">{zoomPercent}</span>
      </div>

      {/* ── 미니맵 메인 영역 (슬라이더 + 맵 + 확장 버튼) ── */}
      <div className="flex items-stretch gap-0">
        {/* ── 데스크탑 줌 슬라이더 (좌측 수직) ── */}
        {!isMobile && (
          <div className="flex flex-col items-center justify-center pr-1.5 gap-1">
            <div className="relative flex items-center justify-center" style={{ height: MAP_SIZE - 20, width: 16 }}>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={sliderValue}
                onChange={handleSliderChange}
                onClick={(e) => e.stopPropagation()}
                className="minimap-zoom-slider"
                style={{
                  width: MAP_SIZE - 20,
                  position: 'absolute',
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center center',
                }}
                aria-label={t('zoomSlider')}
              />
            </div>
          </div>
        )}

        {/* ── 미니맵 본체 ── */}
        <div className="relative bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl p-1.5 shadow-2xl overflow-hidden">
          {/* 확대/축소 토글 버튼 (우상단) */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
            className="absolute top-1 right-1 z-20 p-1 rounded-md bg-slate-800/60 hover:bg-slate-700/80 text-white/40 hover:text-white/80 transition-all duration-200"
            aria-label={isExpanded ? t('minimapShrink') : t('minimapExpand')}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>

          <div
            data-tour="minimap-radar"
            className="relative bg-black/40 rounded-lg overflow-hidden select-none touch-none"
            style={{ width: MAP_SIZE, height: MAP_SIZE, cursor: 'crosshair' }}
            onWheel={(e) => e.stopPropagation()}
            onPointerDown={handleVpPointerDown}
            onPointerMove={handleVpPointerMove}
            onPointerUp={handleVpPointerUp}
            onPointerCancel={handleVpPointerUp}
          >
            <div
              className="absolute pointer-events-none"
              style={{
                width: MAP_SIZE,
                height: MAP_SIZE,
                left: 0,
                top: 0
              }}
            >
              {overviewInfo.nebulae.map(n => (
                <React.Fragment key={n.id}>
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                    style={{
                      left: n.pos.x,
                      top: n.pos.y,
                      width: n.size,
                      height: n.size,
                      background: `radial-gradient(circle, ${n.color} 0%, transparent 80%)`,
                      filter: 'blur(6px)',
                    }}
                  />
                  {/* 성단 레이블 텍스트 */}
                  <div
                    className="absolute -translate-x-1/2 pointer-events-none text-center"
                    style={{
                      left: n.pos.x,
                      top: n.pos.y + n.size / 2 + 2,
                      fontSize: isExpanded ? 9 : 7,
                      color: 'rgba(255,255,255,0.25)',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textShadow: '0 0 4px rgba(0,0,0,0.8)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.name}
                  </div>
                </React.Fragment>
              ))}

              {/* ── 은하 나선 ── */}
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 animate-[spin_60s_linear_infinite] opacity-15 pointer-events-none"
                style={{
                  left:       overviewInfo.corePos.x,
                  top:        overviewInfo.corePos.y,
                  width:      isExpanded ? 320 : 200,
                  height:     isExpanded ? 320 : 200,
                  background: 'conic-gradient(from 0deg, transparent 0%, rgba(237,22,114,0.2) 25%, transparent 50%, rgba(237,22,114,0.2) 75%, transparent 100%)',
                  filter:     'blur(16px)',
                }}
              />
            </div>

            {/* ── 뷰포트 사각형 ── */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 border border-hot-magenta/40 bg-hot-magenta/10 pointer-events-none z-30"
              style={{
                left: overviewInfo.camPos.x,
                top: overviewInfo.camPos.y,
                width:  overviewInfo.vpRect.width,
                height: overviewInfo.vpRect.height,
              }}
            />

            {/* ── 카메라 중심 도트 ── */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50"
              style={{ left: overviewInfo.camPos.x, top: overviewInfo.camPos.y }}
            >
              <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            </div>

            {/* ── 내 픽셀 강조 핀 + 펄스 애니메이션 ── */}
            {overviewInfo.myPixelPos && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40 flex items-center justify-center w-5 h-5"
                style={{ left: overviewInfo.myPixelPos.x, top: overviewInfo.myPixelPos.y }}
              >
                {/* 펄스 링 */}
                <div className="absolute inset-0 rounded-full border border-amber-400/50 animate-[minimap-pulse_2s_ease-out_infinite]" />
                {/* 골드 코어 도트 */}
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
              </div>
            )}
          </div>

          {/* ── 컨트롤 바 (미니맵 하단) ── */}
          <div className="flex items-center justify-between mt-1.5 px-0.5 gap-1">
            <div data-tour="minimap-zoom" className="flex items-center gap-0.5">
              {/* 줌 아웃 */}
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/50 hover:text-white/80 transition-all duration-150 active:scale-90"
                aria-label={t('zoomOut')}
              >
                <Minus className="w-3 h-3" />
              </button>
              {/* 줌 인 */}
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/50 hover:text-white/80 transition-all duration-150 active:scale-90"
                aria-label={t('zoomIn')}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center gap-0.5">
              {/* 내 위치 버튼 */}
              <button
                data-tour="minimap-my-location"
                onClick={handleCenterMyPixel}
                disabled={!user}
                className={`p-1.5 rounded-lg transition-all duration-150 active:scale-90 ${
                  user
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-400/70 hover:text-amber-400'
                    : 'bg-white/5 text-white/20 cursor-not-allowed'
                }`}
                aria-label={t('goToMyPixel')}
                title={t('goToMyPixelTitle')}
              >
                <Circle className="w-3 h-3" fill="currentColor" />
              </button>

              {/* 은하 중심 이동 버튼 */}
              <button
                data-tour="minimap-center"
                onClick={handleCenterGalaxy}
                className="p-1.5 rounded-lg bg-hot-magenta/10 hover:bg-hot-magenta/20 active:bg-hot-magenta/30 text-hot-magenta/70 hover:text-hot-magenta transition-all duration-150 active:scale-90"
                aria-label={t('goToCenter')}
                title={t('goToCenter')}
              >
                <Hexagon className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 커스텀 CSS (펄스 + 슬라이더) ── */}
      <style jsx>{`
        @keyframes minimap-pulse {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          100% {
            transform: scale(1.75);
            opacity: 0;
          }
        }

        .minimap-zoom-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 3px;
          background: linear-gradient(to right, rgba(237,22,114,0.3), rgba(237,22,114,0.6));
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        .minimap-zoom-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgb(237,22,114);
          border: 1px solid rgba(255,255,255,0.2);
          cursor: pointer;
          transition: transform 0.15s;
        }
        .minimap-zoom-slider::-webkit-slider-thumb:hover {
          transform: scale(1.3);
        }
        .minimap-zoom-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgb(237,22,114);
          border: 1px solid rgba(255,255,255,0.2);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
