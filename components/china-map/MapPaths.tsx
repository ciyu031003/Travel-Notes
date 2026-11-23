'use client'

import { memo, useState } from 'react'
import { MAP_STAGE_SHADOW_FILTER } from '@/lib/map-artifact'
import { ChinaMapColors as colors, easyTapProvinceIds, type CityDot, type ProvincePath } from './types'
import type { City } from '@/data/cities'

interface MapPathsProps {
  paths: ProvincePath[]
  dashPath: string
  selectedProvince: string | null
  /** 被选中的省份（几何对象来自 ChinaMap 的缓存数组，引用稳定） */
  selectedPath: ProvincePath | null
  cityDots: CityDot[]
  onProvinceClick: (id: string) => void
  onCityClick: (city: City) => void
}

const width = 1100
const height = 860

/**
 * 地图 SVG（分层 + memo）。
 *
 * 旧实现是一个巨大的函数组件：地图平移/缩放每帧 setOffset，于是 34 条省份路径
 * （每条还挂高斯模糊 filter）连同城市点每帧全部重渲染；点省份时还要再全量重渲染
 * 一遍（变暗/选中态）。
 *
 * 现在拆成四层，各自 memo：
 *   1. BaseProvincePaths —— 34 条静态底图，只依赖 paths（点选/平移/缩放都不重渲）；
 *   2. SelectionLayer    —— 选中省份的高亮叠加（1 条省 ≈ 3 个 path），只在选中变化时重渲；
 *   3. CityDots          —— 只依赖城市点位，内部悬停态不外溢；
 *   4. 静态装饰（底图、虚线、港澳门热区）—— 只在数据变化时重渲。
 *
 * 「其余省份变暗」改由 CSS 完成（.m-map-dimmed 作用在 svg 上，只改 fill-opacity /
 * stroke-opacity / stroke-width / opacity / filter），不触发 React 重渲染。
 * 悬停高亮同样改为 CSS :hover（.m-prov-path），不再通过 props 触发整层重渲。
 */
function MapPathsInner({
  paths,
  dashPath,
  selectedProvince,
  selectedPath,
  cityDots,
  onProvinceClick,
  onCityClick,
}: MapPathsProps) {
  return (
    <svg
      viewBox={'0 0 ' + width + ' ' + height}
      className={selectedProvince ? 'w-full h-full m-map-dimmed' : 'w-full h-full'}
      style={{
        filter: MAP_STAGE_SHADOW_FILTER,
        pointerEvents: 'auto',
      }}
      role="img"
      aria-label="中国旅行地图"
    >
      <defs>
        <filter id="visitedGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feFlood floodColor={colors.bloom} floodOpacity="0.45" />
          <feComposite in2="coloredBlur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="softPixelTexture" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill={colors.cream} fillOpacity="0" />
          <rect x="0" y="0" width="3" height="3" fill={colors.sakura} fillOpacity="0.18" />
          <rect x="4" y="4" width="2" height="2" fill={colors.mist} fillOpacity="0.14" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={height} fill={colors.cream} rx="12" />

      <BaseProvincePaths paths={paths} onProvinceClick={onProvinceClick} />

      {dashPath && (
        <path
          d={dashPath}
          fill="none"
          stroke={colors.ink}
          strokeWidth="0.8"
          strokeOpacity="0.3"
          strokeDasharray="6 4"
          pointerEvents="none"
        />
      )}

      <EasyTapZones paths={paths} selectedProvince={selectedProvince} onProvinceClick={onProvinceClick} />

      <SelectionLayer path={selectedPath} />

      <CityDots dots={cityDots} onCityClick={onCityClick} />
    </svg>
  )
}

/** 34 条省份底图：静态样式（未选中态），变暗交给 CSS，React 不参与 */
const BaseProvincePaths = memo(function BaseProvincePaths({
  paths,
  onProvinceClick,
}: {
  paths: ProvincePath[]
  onProvinceClick: (id: string) => void
}) {
  return (
    <g>
      {paths.map((path) =>
        path.lit ? (
          <path
            key={'glow-' + path.id}
            className="m-prov-glow"
            d={path.d}
            fill="none"
            stroke={colors.bloom}
            strokeWidth="10"
            strokeOpacity="0.18"
            strokeLinejoin="round"
            filter="url(#visitedGlow)"
            pointerEvents="none"
          />
        ) : null
      )}

      {paths.map((path) => (
        <path
          key={path.id}
          data-province-id={path.id}
          d={path.d}
          fill={path.lit ? colors.sakura : colors.dim}
          fillOpacity={path.lit ? 0.68 : 0.34}
          stroke={path.lit ? colors.bloom : colors.ink}
          strokeOpacity={path.lit ? 0.95 : 0.24}
          strokeWidth={path.lit ? 2.2 : 1.25}
          strokeLinejoin="round"
          className="m-prov-path cursor-pointer"
          filter={path.lit ? 'url(#visitedGlow)' : undefined}
          onClick={() => onProvinceClick(path.id)}
        />
      ))}

      {paths.map((path) =>
        path.lit ? (
          <path
            key={'texture-' + path.id}
            className="m-prov-texture"
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
    </g>
  )
})
BaseProvincePaths.displayName = 'BaseProvincePaths'

/** 选中省份高亮（叠加在最上层，1~3 个 path；命中仍交给下方底图） */
const SelectionLayer = memo(function SelectionLayer({ path }: { path: ProvincePath | null }) {
  if (!path) return null
  return (
    <g pointerEvents="none" data-selected-province={path.id}>
      <path
        d={path.d}
        fill="none"
        stroke={colors.bloom}
        strokeWidth="10"
        strokeOpacity="0.18"
        strokeLinejoin="round"
        filter="url(#visitedGlow)"
      />
      <path
        d={path.d}
        fill={colors.bloom}
        fillOpacity="0.8"
        stroke={colors.bloom}
        strokeOpacity="1"
        strokeWidth="3"
        strokeLinejoin="round"
        filter="url(#visitedGlow)"
      />
      <path
        d={path.d}
        fill="url(#softPixelTexture)"
        fillOpacity="0.5"
        stroke={colors.cream}
        strokeWidth="1"
        strokeOpacity="0.3"
        strokeLinejoin="round"
      />
    </g>
  )
})
SelectionLayer.displayName = 'SelectionLayer'

/** 港澳等小面积省份的加宽点击热区（否则真机几乎点不中） */
const EasyTapZones = memo(function EasyTapZones({
  paths,
  selectedProvince,
  onProvinceClick,
}: {
  paths: ProvincePath[]
  selectedProvince: string | null
  onProvinceClick: (id: string) => void
}) {
  return (
    <g>
      {paths.map((path) => {
        if (!easyTapProvinceIds.has(path.id) || !path.centroid) return null
        if (selectedProvince && selectedProvince !== path.id) return null
        const isHK = path.id === 'hongkong'
        return (
          <g
            key={'tap-' + path.id}
            data-province-id={path.id}
            className="cursor-pointer"
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
    </g>
  )
})
EasyTapZones.displayName = 'EasyTapZones'

/** 省份内城市圆点（选中省份后显示）：悬停态只影响这一层 */
const CityDots = memo(function CityDots({
  dots,
  onCityClick,
}: {
  dots: CityDot[]
  onCityClick: (city: City) => void
}) {
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null)
  if (dots.length === 0) return null
  return (
    <g>
      {dots.map((dot) => {
        const isHovered = hoveredCityId === dot.city.id
        const r = dot.hasPosts ? 5.5 : 3.5
        return (
          <g
            key={'city-' + dot.city.id}
            data-city-id={dot.city.id}
            className="cursor-pointer"
            onMouseEnter={() => setHoveredCityId(dot.city.id)}
            onMouseLeave={() => setHoveredCityId((c) => (c === dot.city.id ? null : c))}
            onClick={(event) => {
              event.stopPropagation()
              onCityClick(dot.city)
            }}
          >
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
                {dot.hasPosts && dot.count > 1 ? ' · ' + dot.count : ''}
              </text>
            )}
            <title>
              {dot.city.name + (dot.hasPosts ? '（' + dot.count + ' 条记录）' : '（暂无记录）')}
            </title>
          </g>
        )
      })}
    </g>
  )
})
CityDots.displayName = 'CityDots'

export default memo(MapPathsInner)
