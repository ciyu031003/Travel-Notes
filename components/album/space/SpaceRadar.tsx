'use client'

import type { CityData } from './particlePhoto'

interface SpaceRadarProps {
  cities: CityData[]
  currentIndex: number
  onSelect: (index: number) => void
}

/**
 * 360° 雷达小地图：展示周围唱片方位，当前唱片固定在正上方（12 点方向）
 */
export default function SpaceRadar({ cities, currentIndex, onSelect }: SpaceRadarProps) {
  const count = cities.length
  const size = 108
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 10

  return (
    <div className="absolute bottom-4 right-4 z-30 space-glass rounded-full w-[108px] h-[108px] select-none hidden sm:block">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        {cities.map((city, i) => {
          const theta = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2
          const currentTheta = (currentIndex / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2
          const rel = theta - currentTheta
          const dx = Math.sin(rel) * r
          const dy = -Math.cos(rel) * r
          const isCurrent = i === currentIndex
          return (
            <g key={city.name} transform={`translate(${cx + dx}, ${cy + dy})`} className="cursor-pointer">
              <circle
                r={isCurrent ? 5 : 3.2}
                fill={isCurrent ? '#e8b06a' : 'rgba(245,247,255,0.45)'}
                stroke={isCurrent ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}
                strokeWidth="1"
                onClick={() => onSelect(i)}
              />
              <title>{city.name}</title>
            </g>
          )
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center text-[10px] text-album-text2 tracking-widest">360°</div>
    </div>
  )
}

