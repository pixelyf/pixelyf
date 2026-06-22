'use client'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
}

export default function Sparkline({ data, width = 80, height = 24, className = '' }: SparklineProps) {
  if (!data || data.length < 2) return null

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1

  const padding = 2
  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * innerW
    const y = padding + innerH - ((v - min) / range) * innerH
    return `${x},${y}`
  })

  const lastX = padding + innerW
  const lastY = padding + innerH - ((data[data.length - 1] - min) / range) * innerH

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ overflow: 'visible' }}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="rgb(var(--theme-rgb-light, var(--theme-rgb)))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r="2.5"
        fill="rgb(var(--theme-rgb-light, var(--theme-rgb)))"
      />
    </svg>
  )
}
