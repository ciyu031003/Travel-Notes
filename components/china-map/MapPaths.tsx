'use client'

import { useState } from 'react'
import { ChinaMapColors as colors, easyTapProvinceIds, type CityDot, type ProvincePath } from './types'
import type { City } from '@/data/cities'

interface MapPathsProps {
  paths: ProvincePath[]
  dashPath: string
  hoveredProvince: string | null
  selectedProvince: string | null
  cityDots: CityDot[]
  onProvinceHover: (id: string | null) => void
  onProvinceClick: (id: string) => void
  onCityClick: (city: City) => void
}

const width = 1100
const height = 860

export default function MapPaths({
  paths,
  dashPath,
  hoveredProvince,
  selectedProvince,
  cityDots,
  onProvinceHover,
  onProvinceClick,
  onCityClick,
}: MapPathsProps) {
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null)
  const hasSelection = Boolean(selectedProvince)

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
        path.lit && (!selectedProvince || selectedProvince === path.id) ? (
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
        const dimmed = hasSelection && !isSelected
        return (
          <path
            key={path.id}
            data-province-id={path.id}
            d={path.d}
            fill={isSelected ? colors.bloom : path.lit && !dimmed ? colors.sakura : colors.dim}
            fillOpacity={isSelected ? 0.8 : dimmed ? 0.14 : path.lit ? 0.68 : 0.34}
            stroke={isSelected ? colors.bloom : path.lit && !dimmed ? colors.bloom : colors.ink}
            strokeOpacity={dimmed ? 0.08 : isSelected ? 1 : path.lit ? 0.95 : 0.24}
            strokeWidth={isSelected ? 3 : dimmed ? 0.8 : path.lit ? 2.2 : 1.25}
            strokeLinejoin="round"
            className="cursor-pointer transition-all duration-300"
            filter={(path.lit && !dimmed) || isHovered || isSelected ? 'url(#visitedGlow)' : undefined}
            opacity={dimmed ? 0.5 : 1}
            onMouseEnter={() => onProvinceHover(path.id)}
            onMouseLeave={() => onProvinceHover(null)}
            onClick={() => onProvinceClick(path.id)}
          />
        )
      })}

      {paths.map((path) =>
        path.lit && (!selectedProvince || selectedProvince === path.id) ? (
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
        if (selectedProvince && selectedProvince !== path.id) return null
        const isHK = path.id === 'hongkong'
        return (
          <g
            key={`tap-${path.id}`}
            data-province-id={path.id}
            className="cursor-pointer transition-all duration-300"
            onMouseEnter={() => onProvinceHover(path.id)}
            onMouseLeave={() => onProvinceHover(null)}
            onClick={() => onProvinceClick(path.id)}
          >
            <circle
              cx={path.centroid[0]}
              cy={path.centroid[1]}
              r={isHK ? 24 : 18}
              fill={path.lit ? colors.sakura : colors.dim}
              fillOpacity={path.lit ? 0.68 : 0.22}
              stroke={path.lit ? colors.bloom : colors.ink}
              strokeWidth={path.lit ? 2 : 1}
              strokeOpacity={path.lit ? 0.95 : 0.35}
              filter={path.lit ? 'url(#visitedGlow)' : undefined}
            />
            <circle
              cx={path.centroid[0]}
              cy={path.centroid[1]}
              r="3.5"
              fill={path.lit ? colors.bloom : colors.ink}
              fillOpacity={path.lit ? 0.55 : 0.42}
              pointerEvents="none"
            />
          </g>
        )
      })}

      {/* 省份内城市圆点（选中省份后显示） */}
      {cityDots.map((dot) => {
        const isHovered = hoveredCityId === dot.city.id
        const r = dot.hasPosts ? 5.5 : 3.5
        return (
          <g
            key={`city-${dot.city.id}`}
            data-city-id={dot.city.id}
            className="cursor-pointer transition-all duration-200"
            onMouseEnter={() => setHoveredCityId(dot.city.id)}
            onMouseLeave={() => setHoveredCityId((c) => (c === dot.city.id ? null : c))}
            onClick={(e) => {
              e.stopPropagation()
              onCityClick(dot.city)
            }}
          >
            {/* 有记录城市的光晕 */}
            {dot.hasPosts && (
              <circle
                cx={dot.x}
                cy={dot.y}
                r={isHovered ? 12 : 9}
                fill={colors.sakura}
                fillOpacity="0.4"
                filter="url(#visitedGlow)"
                pointerEvents="none"
              />
            )}
            <circle
              cx={dot.x}
              cy={dot.y}
              r={isHovered ? r + 1.5 : r}
              fill={dot.hasPosts ? colors.bloom : '#9AA6AD'}
              fillOpacity={dot.hasPosts ? 0.95 : 0.5}
              stroke={colors.cream}
              strokeWidth="1.4"
            />
            {/* 城市名标签（悬停或有记录时显示） */}
            {(isHovered || dot.hasPosts) && (
              <text
                x={dot.x + r + 6}
                y={dot.y + 3}
                fontSize="12"
                fontWeight={dot.hasPosts ? 600 : 500}
                fill={colors.ink}
                stroke={colors.cream}
                strokeWidth="3"
                paintOrder="stroke"
                style={{ pointerEvents: 'none' }}
              >
                {dot.city.name}
                {dot.hasPosts && dot.count > 1 ? ` · ${dot.count}` : ''}
              </text>
            )}
            <title>{`${dot.city.name}${dot.hasPosts ? `（${dot.count} 条记录）` : '（暂无记录）'}`}</title>
          </g>
        )
      })}
    </svg>
  )
}
