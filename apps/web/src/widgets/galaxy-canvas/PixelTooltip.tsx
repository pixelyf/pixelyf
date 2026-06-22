'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useTranslations } from 'next-intl'

interface TooltipData {
  pixelId: string
  screenX: number
  screenY: number
  scaledRadius?: number
  displayName?: string
  momentContent?: string
  momentThumbnail?: string
  country?: string
  isMobileTap?: boolean
  rank?: number
}

interface PixelTooltipProps {
  data: TooltipData | null
}

const CountUp = ({ value, t }: { value: number; t: (key: string) => string }) => {
  const formatted = value >= 10000 
    ? (value / 10000).toFixed(1).replace(/\.0$/, '') + t('tenThousand')
    : value >= 1000 
      ? (value / 1000).toFixed(1).replace(/\.0$/, '') + t('thousand')
      : value.toString();

  return <span>{formatted}</span>
}

interface StatsData {
  momentsCount: number
  touches: number
  totalPings: number
  comments: number
  bonds: number
  visits: number
}

// ── [Hover Stats 캐시] ──────────────────────────────────────
// 동일 픽셀에 반복 hover 시 API 재호출 방지.
// TTL 60초 후 자동 만료 → 적당히 신선한 데이터 유지.
const statsCache = new Map<string, { data: StatsData; ts: number }>()
const CACHE_TTL_MS = 3_000

export function PixelTooltip({ data }: PixelTooltipProps) {
  const [activeData, setActiveData] = useState<TooltipData | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [windowW, setWindowW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1920
  )
  const [windowH, setWindowH] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 1080
  )
  const [stats, setStats] = useState<StatsData | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const t = useTranslations('Pixel')
  const isMobile = activeData?.isMobileTap === true

  useEffect(() => {
    if (data) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setActiveData(data)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setActiveData(null)
      }, 500) // 500ms 지연으로 마우스 이동 시간 보장
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [data])

  useEffect(() => {
    const onResize = () => {
      setWindowW(window.innerWidth)
      setWindowH(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!activeData?.pixelId) return
    let isMounted = true

    const cacheKey = `${activeData.pixelId}__${galaxyKey}`
    const cached = statsCache.get(cacheKey)

    // 캐시 히트: TTL 이내면 API 호출 생략
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setStats(cached.data)
      setIsScanning(false)
      return
    }

    // 캐시 미스: API fetch
    setIsScanning(true)
    setStats(null)

    fetch(`/api/users/${activeData.pixelId}/statistics?galaxy=${galaxyKey}`)
      .then(res => res.json())
      .then(resData => {
        if (!isMounted) return
        if (resData.success && resData.data) {
          const parsed: StatsData = {
            momentsCount: resData.data.momentsCount || 0,
            touches: resData.data.touches || 0,
            totalPings: resData.data.totalPings || 0,
            comments: resData.data.comments || 0,
            bonds: resData.data.bonds || 0,
            visits: resData.data.visits?.total_visits || 0
          }
          statsCache.set(cacheKey, { data: parsed, ts: Date.now() })
          setStats(parsed)
        }
        setIsScanning(false)
      })
      .catch(() => {
        if (isMounted) setIsScanning(false)
      })

    return () => { isMounted = false }
  }, [activeData?.pixelId, galaxyKey])

  if (!activeData || (!activeData.momentContent && !activeData.momentThumbnail && !activeData.displayName)) return null

  // 마우스 진입 시 닫기 예약 타이머 취소
  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }

  // 마우스가 말풍선 영역에서 이탈 시 즉시 닫기
  const handleMouseLeave = () => {
    setActiveData(null)
  }

  // ── 피드 영역 클릭 핸들러 (상세 판넬 열기) ──
  const handleOpenFeedDetail = () => {
    if (!activeData?.pixelId) return
    useGalaxyStore.getState().selectPixel(activeData.pixelId)
    window.dispatchEvent(new CustomEvent('pixel-hover', { detail: null }))
  }

  // ── 통계 영역 클릭 핸들러 (상세 판넬 + 인사이트 드로어 즉시 열기) ──
  const handleOpenInsightDetail = () => {
    if (!activeData?.pixelId) return
    useGalaxyStore.getState().selectPixel(activeData.pixelId)
    useGalaxyStore.getState().setIsInsightOpen(true)
    window.dispatchEvent(new CustomEvent('pixel-hover', { detail: null }))
  }

  // 패널 가로 길이
  const PANEL_WIDTH = isMobile ? Math.min(280, windowW - 40) : 380
  // 사선(대각선)의 x, y 이동 거리 (가장자리에서부터 뻗어나가는 길이)
  const DIAG_OFFSET = isMobile ? 0 : 45

  let tooltipLeft = 0
  let tooltipTop = 0
  let isFlipped = false

  const pixelRadius = activeData.scaledRadius || 0
  isFlipped = activeData.screenX + pixelRadius + DIAG_OFFSET + PANEL_WIDTH + 20 > windowW
  
  // 툴팁 전체 예상 높이: 카드(~120px) + HUD(~80px) + 자세히보기(32px) + 간격 및 오프셋 = ~280px
  const ESTIMATED_TOOLTIP_HEIGHT = 280
  // screenY가 상단 영역에 너무 가까우면 아래쪽으로 툴팁을 플립
  const isFlippedY = !isMobile && (activeData.screenY - DIAG_OFFSET - ESTIMATED_TOOLTIP_HEIGHT < 80)

  if (isMobile) {
    // 모바일: 화면 수평 중앙, 수직으로는 캔버스 상단 고정 (탭 위치 무시, 캔버스 가림 방지)
    tooltipLeft = (windowW - PANEL_WIDTH) / 2
    tooltipTop = 80 // 헤더 아래 적당한 상단 여백
  } else {
    // 데스크탑: 기존 로직 유지
    tooltipLeft = isFlipped ? activeData.screenX - pixelRadius : activeData.screenX + pixelRadius
    tooltipTop = activeData.screenY
  }

  const textContent = activeData.momentContent?.replace(/\n/g, ' ').trim() || ''

  // 라인은 무조건 위로 공통 꺾임 (-DIAG_OFFSET 고정)
  const targetY = -DIAG_OFFSET
  const svgPath = isFlipped
    ? `M 0 0 L ${-DIAG_OFFSET} ${targetY} L ${-DIAG_OFFSET - PANEL_WIDTH} ${targetY}`
    : `M 0 0 L ${DIAG_OFFSET} ${targetY} L ${DIAG_OFFSET + PANEL_WIDTH} ${targetY}`

  // 공통 카드 & HUD 컴여링 헬퍼
  const renderCardAndHUD = () => (
    <>
      {/* 윗부분: 카드 정보 영역 (클릭 시 상세 판넬 오픈) */}
      <div 
        className="w-full bg-white border border-slate-300 p-4 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.15)] flex gap-4 cursor-pointer hover:bg-slate-50/80 hover:border-slate-400/80 active:bg-slate-100/50 transition-colors"
        style={{
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.02)',
        }}
        onClick={handleOpenFeedDetail}
      >
        {activeData.momentThumbnail && (
          <div className="relative shrink-0">
            <img
              src={activeData.momentThumbnail}
              alt=""
              className="w-16 h-16 rounded-md object-cover border border-slate-300 opacity-90 grayscale-[20%]"
            />
            {/* 이미지 모서리 장식 */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-slate-400" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-slate-400" />
          </div>
        )}
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1.5">
            {activeData.country ? (
              <img 
                src={`/flags/${activeData.country.toLowerCase()}.svg`} 
                alt={activeData.country}
                className="w-[18px] h-[18px] shrink-0 shadow-sm rounded-[1px]"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
              />
            ) : (
              <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse shadow-[0_0_8px_rgba(100,116,139,1)] mx-1" />
            )}
            <span className="text-[12px] font-bold text-black uppercase truncate">
              {activeData.displayName ? activeData.displayName : 'UNKNOWN_ENTITY'}
            </span>
          </div>
          {textContent ? (
            <p className="text-[16px] font-medium text-black leading-relaxed line-clamp-3 break-keep">
              <span>{textContent}</span>
            </p>
          ) : (
            <p className="text-[12px] text-slate-500">
              {t('noMomentData')}
            </p>
          )}
        </div>
      </div>

      {/* 아랫부분: HUD Data Panel (클릭 시 분석/인사이트 모달 오픈) */}
      <div 
        className="mt-1 flex items-center px-3 py-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-300 hover:border-slate-400/80 rounded-lg text-[12px] text-black shadow-[0_4px_16px_rgba(0,0,0,0.08)] relative cursor-pointer transition-colors"
        onClick={handleOpenInsightDetail}
      >
        {isScanning ? (
          <div className="w-full flex items-center gap-2 animate-pulse">
            <div className="w-2 h-2 bg-black" />
            <span>[ SCANNING DATA... ]</span>
          </div>
        ) : stats ? (
          <motion.div 
            initial={{ opacity: 0, y: -2 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full grid grid-cols-3 gap-y-1.5 gap-x-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-700">{t('tooltipFeed')}</span>
              <span className="text-black font-bold"><CountUp value={stats.momentsCount} t={t} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">{t('tooltipComment')}</span>
              <span className="text-black font-bold"><CountUp value={stats.comments} t={t} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">{t('tooltipTouch')}</span>
              <span className="text-black font-bold"><CountUp value={stats.touches} t={t} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">{t('tooltipPing')}</span>
              <span className="text-black font-bold"><CountUp value={stats.totalPings} t={t} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">{t('tooltipBond')}</span>
              <span className="text-black font-bold"><CountUp value={stats.bonds} t={t} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">{t('tooltipVisit')}</span>
              <span className="text-black font-bold"><CountUp value={stats.visits} t={t} /></span>
            </div>
          </motion.div>
        ) : (
          <div className="w-full flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500" />
            <span className="text-red-600 font-bold">[ DATA OFFLINE ]</span>
          </div>
        )}


      </div>
    </>
  )

  return (
    <AnimatePresence>
      {activeData && (
        <motion.div
          key={`${activeData.pixelId}-${isMobile ? 'mobile' : 'desktop'}`}
          initial={{ opacity: 0, scale: isMobile ? 0.9 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: isMobile ? 0.9 : 1 }}
          transition={{ duration: 0.2 }}
          className={`fixed ${isMobile ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={{
            left: tooltipLeft,
            top: tooltipTop,
            zIndex: 60,
            ...(isMobile ? { width: PANEL_WIDTH } : {}),
          }}
        >
          {/* 1. Holographic Laser Anchor Line (SVG) — 데스크탑 전용 */}
          {!isMobile && (
            <svg className="absolute overflow-visible" style={{ left: 0, top: 0 }}>
              {/* 은은한 글로우 효과를 위한 밑바탕 선 */}
              <motion.path
                d={svgPath}
                fill="transparent"
                stroke="rgba(100,116,139,0.15)"
                strokeWidth="3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
              {/* 얇고 선명한 중심 레이저 선 */}
              <motion.path
                d={svgPath}
                fill="transparent"
                stroke="rgba(100,116,139,0.9)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
              {/* 정중앙(시작점) 발광 포인트 */}
              <motion.circle 
                cx="0" cy="0" r="3" fill="#64748b"
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 }}
                style={{ filter: 'drop-shadow(0 0 5px #64748b)' }}
              />
            </svg>
          )}

          {/* 2. Unified Content & Interaction Panel (단일 마우스 호버 영역 통합) */}
          <motion.div
            initial={{ opacity: 0, y: isMobile ? 6 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: isMobile ? 0.05 : 0.25, duration: 0.2 }}
            className={isMobile ? 'w-full flex flex-col pointer-events-auto' : `absolute flex flex-col justify-end pointer-events-auto ${isFlipped ? 'right-[45px]' : 'left-[45px]'}`}
            style={isMobile ? {} : isFlippedY ? {
              top: -DIAG_OFFSET, // 가로선(y = -45px) 위치를 기준으로 아래로 뻗음
              width: PANEL_WIDTH,
            } : {
              bottom: DIAG_OFFSET, // 가로선(y = -45px) 위치를 기준으로 위로 뻗음
              width: PANEL_WIDTH,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {renderCardAndHUD()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
