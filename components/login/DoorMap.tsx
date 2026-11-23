'use client'

import { useMemo } from 'react'
import { provinceGeometries, useMapArtifact } from '@/lib/map-artifact'

const WIDTH = 1100
const HEIGHT = 860

interface DoorMapProps {
  className?: string
}

/**
 * 地图门的门面：中国地图线稿（真实地理数据，非插画）。
 * 颜色由父级通过 CSS 变量 --door-map-fill / --door-map-stroke 控制，便于明暗主题切换。
 *
 * F1（2026-11-23）：几何改为构建期产物（public/map/china-paths.v1.json），
 * 不再 import lib/geo（582KB GeoJSON + d3-geo 曾被这一段门面图一起拖进客户端）。
 * 产物到达前渲染空 SVG（本组件由 LoginDoor 动态挂载、门扇开合动画 1.1s，空帧不可见）。
 */
export default function DoorMap({ className }: DoorMapProps) {
  const artifact = useMapArtifact()
  const { paths, dashPath } = useMemo(() => {
    if (!artifact) return { paths: [] as { id: string; d: string }[], dashPath: '' }
    return {
      paths: provinceGeometries(artifact).map((province) => ({ id: province.id, d: province.d })),
      dashPath: artifact.dashLine || '',
    }
  }, [artifact])

  return (
    <svg
      viewBox={'0 0 ' + WIDTH + ' ' + HEIGHT}
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
