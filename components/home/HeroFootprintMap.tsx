'use client'

import { useMemo } from 'react'
import {
  chinaFeatures,
  makeProjection,
  makePath,
  provinceIdOf,
} from '@/lib/geo'
import { findProvinceByLocation } from '@/lib/province-map'
import type { PostMeta } from '@/components/ChinaMap'

const WIDTH = 1100
const HEIGHT = 860

interface HeroFootprintMapProps {
  posts: PostMeta[]
}

/**
 * 首页 Hero 的沉浸足迹地图（只读）：
 * - 去过省份玫瑰色点亮
 * - 按首次到访时间把省份中心连成航线，虚线流动动画
 * - 每个去过省份盖一枚小邮戳点
 */
export default function HeroFootprintMap({ posts }: HeroFootprintMapProps) {
  const { provincePaths, litIds, routeD, dots } = useMemo(() => {
    const projection = makeProjection(WIDTH, HEIGHT, 24)
    const pathGen = makePath(projection)
    const provincePaths = chinaFeatures.map((feature) => ({
      id: provinceIdOf(feature),
      d: pathGen(feature as never) || '',
    }))

    const byProvince = new Map<string, { count: number; first: number }>()
    for (const post of posts) {
      if (!post.location) continue
      const province = findProvinceByLocation(post.location)
      if (!province) continue
      const t = new Date(post.date).getTime()
      const cur = byProvince.get(province.id)
      if (!cur) {
        byProvince.set(province.id, { count: 1, first: t })
      } else {
        cur.count += 1
        if (t < cur.first) cur.first = t
      }
    }

    const litIds = new Set(byProvince.keys())

    const ordered = Array.from(byProvince.entries()).sort((a, b) => a[1].first - b[1].first)
    const dots: { id: string; x: number; y: number; count: number }[] = []
    const centroids: [number, number][] = []
    for (const [id, info] of ordered) {
      const feature = chinaFeatures.find((f) => provinceIdOf(f) === id)
      if (!feature) continue
      const c = pathGen.centroid(feature as never)
      if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        // 四舍五入避免 SSR 与客户端浮点差异导致 hydration mismatch
        const x = Math.round(c[0] * 100) / 100
        const y = Math.round(c[1] * 100) / 100
        centroids.push([x, y])
        dots.push({ id, x, y, count: info.count })
      }
    }

    let routeD = ''
    if (centroids.length > 1) {
      routeD = 'M' + centroids.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
    }

    return { provincePaths, litIds, routeD, dots }
  }, [posts])

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
    >
      <g strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
        {provincePaths.map((p) => {
          const lit = litIds.has(p.id)
          return (
            <path
              key={p.id}
              d={p.d}
              fill={lit ? 'rgba(166,78,97,0.22)' : 'rgba(61,72,82,0.045)'}
              stroke={lit ? 'rgba(166,78,97,0.65)' : 'rgba(61,72,82,0.26)'}
              className={lit ? 'hero-map-lit' : undefined}
              style={lit ? { filter: 'drop-shadow(0 0 4px rgba(232,184,194,0.45))' } : undefined}
            />
          )
        })}
      </g>

      {routeD && (
        <path
          d={routeD}
          fill="none"
          stroke="#C76E80"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="6 6"
          className="hero-route"
        />
      )}

      {dots.map((d) => (
        <g key={d.id}>
          <circle cx={d.x} cy={d.y} r="8" fill="#A64E61" opacity="0.18" />
          <circle cx={d.x} cy={d.y} r="3.6" fill="#C76E80" stroke="#FFF8F4" strokeWidth="1" />
        </g>
      ))}
    </svg>
  )
}
