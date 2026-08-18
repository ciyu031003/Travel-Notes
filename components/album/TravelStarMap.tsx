'use client'

import { useMemo } from 'react'

export interface TravelStarMapCity {
  name: string
  lat: number
  lng: number
  date?: string
  count?: number
}

interface TravelStarMapProps {
  cities: TravelStarMapCity[]
  stats?: { cities?: number; days?: number; photos?: number }
  className?: string
}

const LON_MIN = 73
const LON_MAX = 135
const LAT_MIN = 18
const LAT_MAX = 53

function project(lat: number, lng: number, w: number, h: number) {
  const x = ((lng - LON_MIN) / (LON_MAX - LON_MIN)) * w
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * h
  return { x, y }
}

/**
 * 旅行星图：以星点 + 连线呈现去过的城市（按时间顺序连线）。
 * 银河背景只做氛围，星图本体是城市足迹的可视化。
 */
export default function TravelStarMap({ cities, stats, className }: TravelStarMapProps) {
  const W = 800
  const H = 600

  const points = useMemo(
    () =>
      cities
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
        .map((c) => ({ ...c, ...project(c.lat, c.lng, W, H) })),
    [cities, W, H]
  )

  const grid = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (let i = 0; i <= 4; i++) {
      const x = (W / 4) * i
      lines.push({ x1: x, y1: 0, x2: x, y2: H })
    }
    for (let i = 0; i <= 3; i++) {
      const y = (H / 3) * i
      lines.push({ x1: 0, y1: y, x2: W, y2: y })
    }
    return lines
  }, [W, H])

  if (points.length === 0) {
    return (
      <div className={`flex items-center justify-center text-album-text2 ${className}`}>
        还没有可绘制的城市足迹
      </div>
    )
  }

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="旅行星图">
        {/* 星图网格 */}
        {grid.map((g, i) => (
          <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}

        {/* 足迹连线 */}
        {points.length > 1 && <path d={path} fill="none" stroke="rgba(232,176,106,0.55)" strokeWidth="1.5" strokeDasharray="4 5" />}

        {points.map((p, i) => (
          <g key={`${p.name}-${i}`} transform={`translate(${p.x}, ${p.y})`}>
            <circle r={i === 0 ? 6 : 4} fill={i === 0 ? '#e8b06a' : 'rgba(245,247,255,0.75)'} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
            <text x="0" y="-10" textAnchor="middle" className="fill-album-text1" style={{ fontSize: 12, fontFamily: 'Zpix, monospace' }}>
              {p.name}
            </text>
            {p.date && (
              <text x="0" y="16" textAnchor="middle" className="fill-album-text2" style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
                {p.date}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="mt-2 text-center font-zpix text-xs text-album-accent">
        {stats && (stats.days !== undefined || stats.photos !== undefined)
          ? `我们一起去过 ${stats.cities ?? points.length} 城 · ${stats.days ?? 0} 天 · ${stats.photos ?? 0} 张照片`
          : `我们一起去过 ${points.length} 个城市`}
      </p>
    </div>
  )
}


