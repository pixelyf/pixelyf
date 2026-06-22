'use client'

import { useState, useRef, useCallback, useMemo } from 'react'

interface DataPoint {
  date: string
  count: number
}

interface AnalyticsLineChartProps {
  data: DataPoint[]
  previousData?: DataPoint[]
  height?: number
  className?: string
}

export default function AnalyticsLineChart({
  data,
  previousData,
  height = 200,
  className = '',
}: AnalyticsLineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [svgWidth, setSvgWidth] = useState(0)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const obs = new ResizeObserver(entries => {
        for (const entry of entries) {
          setSvgWidth(entry.contentRect.width)
        }
      })
      obs.observe(node)
      setSvgWidth(node.getBoundingClientRect().width)
    }
  }, [])

  const padding = { top: 20, right: 16, bottom: 32, left: 40 }

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null

    const maxVal = Math.max(...data.map(d => d.count), 1)
    const innerW = svgWidth - padding.left - padding.right
    const innerH = height - padding.top - padding.bottom

    // Y축 그리드 계산 (4~5개)
    const yStep = Math.ceil(maxVal / 4)
    const yLines = Array.from({ length: 5 }, (_, i) => i * yStep).filter(v => v <= maxVal + yStep)

    const getX = (i: number) => padding.left + (i / Math.max(data.length - 1, 1)) * innerW
    const getY = (v: number) => padding.top + innerH - (v / (maxVal || 1)) * innerH

    // 현재 기간 path (cubic bezier)
    const currentPath = data.map((d, i) => {
      const x = getX(i)
      const y = getY(d.count)
      if (i === 0) return `M ${x} ${y}`
      const prevX = getX(i - 1)
      const cpX = (prevX + x) / 2
      return `C ${cpX} ${getY(data[i - 1].count)} ${cpX} ${y} ${x} ${y}`
    }).join(' ')

    // 이전 기간 path
    let previousPath = ''
    if (previousData && previousData.length > 0) {
      const prevMax = Math.max(...previousData.map(d => d.count), maxVal, 1)
      const getYPrev = (v: number) => padding.top + innerH - (v / (prevMax || 1)) * innerH
      previousPath = previousData.map((d, i) => {
        const x = getX(Math.min(i, data.length - 1))
        const y = getYPrev(d.count)
        if (i === 0) return `M ${x} ${y}`
        const prevX = getX(Math.min(i - 1, data.length - 1))
        const cpX = (prevX + x) / 2
        return `C ${cpX} ${getYPrev(previousData[i - 1].count)} ${cpX} ${y} ${x} ${y}`
      }).join(' ')
    }

    // X축 라벨 (7개 이하 표시)
    const labelInterval = Math.max(1, Math.floor(data.length / 6))
    const xLabels = data
      .map((d, i) => ({ index: i, label: formatDateLabel(d.date) }))
      .filter((_, i) => i % labelInterval === 0 || i === data.length - 1)

    return { currentPath, previousPath, getX, getY, yLines, xLabels, maxVal, innerW, innerH }
  }, [data, previousData, svgWidth, height, padding.left, padding.right, padding.top, padding.bottom])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !data || data.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - padding.left
    const innerW = svgWidth - padding.left - padding.right
    const ratio = x / innerW
    const index = Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1))))
    setHoverIndex(index)
  }, [data, svgWidth, padding.left, padding.right])

  if (!data || data.length === 0 || !chartData || svgWidth === 0) {
    return (
      <div ref={containerRef} className={`w-full ${className}`} style={{ height }}>
        <div className="flex items-center justify-center h-full text-white/20 text-xs">
          데이터가 없습니다
        </div>
      </div>
    )
  }

  const { currentPath, previousPath, getX, getY, yLines, xLabels } = chartData

  return (
    <div ref={containerRef} className={`w-full relative ${className}`}>
      <svg
        ref={svgRef}
        width={svgWidth}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        className="cursor-crosshair"
      >
        {/* Y축 그리드 */}
        {yLines.map((v, i) => {
          const y = getY(v)
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={svgWidth - padding.right}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                fill="rgba(255,255,255,0.3)"
                fontSize="10"
              >
                {v}
              </text>
            </g>
          )
        })}

        {/* X축 라벨 */}
        {xLabels.map(({ index, label }) => (
          <text
            key={index}
            x={getX(index)}
            y={height - 8}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize="10"
          >
            {label}
          </text>
        ))}

        {/* 이전 기간 비교선 (점선) */}
        {previousPath && (
          <path
            d={previousPath}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
        )}

        {/* 현재 기간 라인 (Primary) */}
        <path
          d={currentPath}
          fill="none"
          stroke="rgb(var(--theme-rgb))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* hover 수직 가이드라인 + dot + 툴팁 */}
        {hoverIndex !== null && (
          <>
            <line
              x1={getX(hoverIndex)}
              y1={padding.top}
              x2={getX(hoverIndex)}
              y2={height - padding.bottom}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
            />
            <circle
              cx={getX(hoverIndex)}
              cy={getY(data[hoverIndex].count)}
              r="4"
              fill="rgb(var(--theme-rgb-light, var(--theme-rgb)))"
              stroke="rgba(0,0,0,0.3)"
              strokeWidth="1"
            />
          </>
        )}
      </svg>

      {/* 툴팁 (hover) */}
      {hoverIndex !== null && (
        <div
          className="absolute pointer-events-none bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5 text-xs"
          style={{
            left: Math.min(getX(hoverIndex), svgWidth - 120),
            top: Math.max(0, getY(data[hoverIndex].count) - 44),
          }}
        >
          <div className="text-white/50">{data[hoverIndex].date}</div>
          <div className="text-white font-bold">{data[hoverIndex].count.toLocaleString()}</div>
        </div>
      )}
    </div>
  )
}

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch {
    return dateStr.slice(5)
  }
}
