'use client'

import { useMemo } from 'react'
import {
  chinaFeatures,
  dashLineFeature,
  makeProjection,
  makePath,
  provinceIdOf,
} from '@/lib/geo'

const WIDTH = 1100
const HEIGHT = 860

interface DoorMapProps {
  className?: string
}

/**
 * 地图门的门面：中国地图线稿（真实地理数据，非插画）。
 * 颜色由父级通过 CSS 变量 --door-map-fill / --door-map-stroke 控制，便于明暗主题切换。
 */
export default function DoorMap({ className }: DoorMapProps) {
  const { paths, dashPath } = useMemo(() => {
    const projection = makeProjection(WIDTH, HEIGHT, 24)
    const pathGen = makePath(projection)
    const provincePaths = chinaFeatures.map((feature) => ({
      id: provinceIdOf(feature),
      d: pathGen(feature as never) || '',
    }))
    const dash = dashLineFeature ? pathGen(dashLineFeature as never) || '' : ''
    return { paths: provincePaths, dashPath: dash }
  }, [])

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <g strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill="var(--door-map-fill, rgba(168,95,58,0.07))"
            stroke="var(--door-map-stroke, rgba(61,72,82,0.55))"
          />
        ))}
      </g>
      {dashPath && (
        <path
          d={dashPath}
          fill="none"
          stroke="var(--door-map-stroke, rgba(61,72,82,0.55))"
          strokeWidth="1.4"
          strokeDasharray="5 6"
        />
      )}
    </svg>
  )
}
