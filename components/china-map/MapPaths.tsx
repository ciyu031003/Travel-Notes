'use client'

import { ChinaMapColors as colors, easyTapProvinceIds, type ProvincePath } from './types'

interface MapPathsProps {
  paths: ProvincePath[]
  dashPath: string
  hoveredProvince: string | null
  selectedProvince: string | null
  onProvinceHover: (id: string | null) => void
  onProvinceClick: (id: string) => void
}

const width = 1100
const height = 860

export default function MapPaths({
  paths,
  dashPath,
  hoveredProvince,
  selectedProvince,
  onProvinceHover,
  onProvinceClick,
}: MapPathsProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full"
      style={{
        filter: 'drop-shadow(0 16px 26px rgba(168,200,220,0.18))',
        pointerEvents: 'auto',
      }}
      role="img"
      aria-label="中国旅行地图"
    >
      <defs>
        <filter
          id="visitedGlow"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feFlood floodColor={colors.bloom} floodOpacity="0.45" />
          <feComposite in2="coloredBlur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern
          id="softPixelTexture"
          x="0"
          y="0"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <rect width="8" height="8" fill={colors.cream} fillOpacity="0" />
          <rect
            x="0"
            y="0"
            width="3"
            height="3"
            fill={colors.sakura}
            fillOpacity="0.18"
          />
          <rect
            x="4"
            y="4"
            width="2"
            height="2"
            fill={colors.mist}
            fillOpacity="0.14"
          />
        </pattern>
      </defs>

      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        fill={colors.cream}
        rx="12"
      />

      {paths.map((path) =>
        path.lit ? (
          <path
            key={`glow-${path.id}`}
            d={path.d}
            fill="none"
            stroke={colors.bloom}
            strokeWidth="10"
            strokeOpacity="0.18"
            strokeLinejoin="round"
            filter="url(#visitedGlow)"
          />
        ) : null
      )}

      {paths.map((path) => {
        const isHovered = hoveredProvince === path.id
        const isSelected = selectedProvince === path.id
        return (
          <path
            key={path.id}
            d={path.d}
            fill={isSelected ? colors.bloom : path.lit ? colors.sakura : colors.dim}
            fillOpacity={isSelected ? 0.75 : path.lit ? 0.68 : 0.34}
            stroke={path.lit ? colors.bloom : colors.ink}
            strokeOpacity={path.lit ? 0.95 : 0.24}
            strokeWidth={isSelected ? 3 : path.lit ? 2.2 : 1.25}
            strokeLinejoin="round"
            className="cursor-pointer transition-all duration-300"
            filter={path.lit || isHovered || isSelected ? 'url(#visitedGlow)' : undefined}
            onMouseEnter={() => onProvinceHover(path.id)}
            onMouseLeave={() => onProvinceHover(null)}
            onClick={() => onProvinceClick(path.id)}
          />
        )
      })}

      {paths.map((path) =>
        path.lit ? (
          <path
            key={`texture-${path.id}`}
            d={path.d}
            fill="url(#softPixelTexture)"
            fillOpacity="0.5"
            stroke={colors.cream}
            strokeWidth="1"
            strokeOpacity="0.3"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ) : null
      )}

      {dashPath && (
        <path
          d={dashPath}
          fill="none"
          stroke={colors.ink}
          strokeWidth="0.8"
          strokeOpacity="0.3"
          strokeDasharray="6 4"
        />
      )}

      {paths.map((path) => {
        if (!easyTapProvinceIds.has(path.id) || !path.centroid) return null
        const isHK = path.id === 'hongkong'
        return (
          <g
            key={`tap-${path.id}`}
            className="cursor-pointer transition-all duration-300"
            onMouseEnter={() => onProvinceHover(path.id)}
            onMouseLeave={() => onProvinceHover(null)}
            onClick={() => onProvinceClick(path.id)}
          >
            <circle
              cx={path.centroid[0]}
              cy={path.centroid[1]}
              r={isHK ? 24 : 18}
              fill={colors.sakura}
              fillOpacity="0.68"
              stroke={colors.bloom}
              strokeWidth="2"
              strokeOpacity="0.95"
              filter="url(#visitedGlow)"
            />
            <circle
              cx={path.centroid[0]}
              cy={path.centroid[1]}
              r="3.5"
              fill={colors.bloom}
              pointerEvents="none"
            />
          </g>
        )
      })}
    </svg>
  )
}
