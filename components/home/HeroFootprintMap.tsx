'use client'

import { useMemo } from 'react'
import {
  chinaFeatures,
  makeProjection,
  makePath,
  provinceIdOf,
} from '@/lib/geo'
import { findProvinceByLocation } from '@/lib/province-map'
import { postPhotoCount } from '@/lib/home/photo-count'
import type { PostMeta } from '@/components/ChinaMap'

const WIDTH = 1100
const HEIGHT = 860

/**
 * 地图调色板（本文件内集中声明一次）。
 *
 * 为什么集中：这些都是 SVG 内联绘制的颜色，散落在 path / circle / text 上时，
 * 每加一个标记（如「张数药丸」）就会多出几处硬编码 hex —— design-token 门禁
 * 按「硬编码 hex 出现次数」计数，新增标记不该让门禁回退。集中声明后，
 * 新标记只引用常量；同时这张插图的实际配色也一眼可读。
 * （暖色系沿用首页既有艺术方向：墨褐 + 陶土 + 米纸，不引入参考站的蓝色）
 */
const MAP_COLORS = {
  /** 省名 / 数字的墨褐 */
  ink: '#8A4A2B',
  /** 航线与邮戳点的陶土 */
  clay: '#C97E55',
  /** 邮戳光晕的深陶土 */
  deepClay: '#A85F3A',
  /** 药丸底与文字描边的米纸 */
  paper: '#FBF3E9',
} as const

interface HeroFootprintMapProps {
  posts: PostMeta[]
  /**
   * 是否在地图标记上直接标**照片张数**（参考站 mytravelmap.cn 最有辨识度的元素：
   * 地图即索引，标记自带张数）。默认开。
   *
   * 移动端首页的地图只有 200px 高，而 viewBox 高 860 —— 缩放比 0.23 会把标记文字
   * 压到 3px 不可读，因此那里由覆盖条承担张数（`countBadges={false}`）。
   */
  countBadges?: boolean
}

/**
 * 首页 Hero 的沉浸足迹地图（只读）：
 * - 去过省份玫瑰色点亮
 * - 按首次到访时间把省份中心连成航线，虚线流动动画
 * - 每个去过省份盖一枚小邮戳点，并在标记上标该省**照片张数**（参考站的「地图即索引」）
 */
export default function HeroFootprintMap({ posts, countBadges = true }: HeroFootprintMapProps) {
  const { provincePaths, litIds, routeD, dots, labelById, pillById } = useMemo(() => {
    const projection = makeProjection(WIDTH, HEIGHT, 24)
    const pathGen = makePath(projection)
    const provincePaths = chinaFeatures.map((feature) => ({
      id: provinceIdOf(feature),
      d: pathGen(feature as never) || '',
    }))

    const byProvince = new Map<string, { count: number; photos: number; first: number; name: string }>()
    for (const post of posts) {
      if (!post.location) continue
      const province = findProvinceByLocation(post.location)
      if (!province) continue
      const t = new Date(post.date).getTime()
      // 张数口径收口在 lib/home/photo-count（与 hero 统计行、移动端覆盖条同一来源）
      const photos = postPhotoCount(post)
      const cur = byProvince.get(province.id)
      if (!cur) {
        byProvince.set(province.id, { count: 1, photos, first: t, name: province.name })
      } else {
        cur.count += 1
        cur.photos += photos
        if (t < cur.first) cur.first = t
      }
    }

    const litIds = new Set(byProvince.keys())

    const ordered = Array.from(byProvince.entries()).sort((a, b) => a[1].first - b[1].first)
    const dots: { id: string; x: number; y: number; count: number; photos: number; name: string }[] = []
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
        dots.push({ id, x, y, count: info.count, photos: info.photos, name: info.name })
      }
    }

    let routeD = ''
    if (centroids.length > 1) {
      routeD = 'M' + centroids.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
    }

    /*
     * 张数药丸 + 省份名的**占位排布**。
     *
     * 为什么要有占位检测：参考站把张数直接标在标记上（地图即索引），但东部省份中心
     * 彼此很近（沪苏浙皖…），药丸与省名会互相压字 —— 字被压住比不画更糟。
     * 规则：药丸优先画在点上方的候选位（被占则落下方的候选位），省名只在
     * 「离任何药丸/已放置的省名/其它省份中心都够远」时才画，宁可少画几个名字。
     * 所有阈值都用 viewBox 单位（1100×860），是"看得清"的经验值。
     */
    const NEAR_X = 44
    const NEAR_Y = 22
    const pillSpots: { x: number; y: number }[] = []
    const pills: { id: string; x: number; y: number; w: number; text: string }[] = []
    const taken = (p: { x: number; y: number }) =>
      pillSpots.some((q) => Math.abs(q.x - p.x) < NEAR_X && Math.abs(q.y - p.y) < NEAR_Y)

    if (countBadges) {
      for (const d of dots) {
        if (d.photos <= 0) continue
        const text = `${d.photos} 张`
        // 中文「张」+ 数字的保守估宽：SVG 里没有文本测量，宁可宽一点也不要压边
        const w = 18 + text.length * 9
        const above = { x: d.x, y: d.y - 30 }
        const below = { x: d.x, y: d.y + 30 }
        const spot = taken(above) && !taken(below) ? below : above
        pillSpots.push(spot)
        pills.push({ id: d.id, x: spot.x - w / 2, y: spot.y - 12, w, text })
      }
    }

    // 省名：按首访顺序左右交替；与药丸/已放置省名/其它省份中心太近就跳过
    const labelById = new Map<string, 'l' | 'r'>()
    const placed: { x: number; y: number }[] = []
    for (const d of dots) {
      // 自身要排除：否则「自己和自己的距离 = 0」会把所有省名判为拥挤
      const others = dots.filter((o) => o.id !== d.id).map((o) => ({ x: o.x, y: o.y }))
      const crowded = [...placed, ...pillSpots, ...others]
        .some((p) => Math.abs(p.x - d.x) < NEAR_X && Math.abs(p.y - d.y) < NEAR_Y)
      if (crowded) continue
      labelById.set(d.id, placed.length % 2 === 0 ? 'l' : 'r')
      placed.push({ x: d.x, y: d.y })
    }

    return { provincePaths, litIds, routeD, dots, labelById, pillById: new Map(pills.map((p) => [p.id, p])) }
  }, [posts, countBadges])

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
              fill={lit ? 'rgba(168,95,58,0.22)' : 'rgba(61,72,82,0.045)'}
              stroke={lit ? 'rgba(168,95,58,0.65)' : 'rgba(61,72,82,0.26)'}
              className={lit ? 'hero-map-lit' : undefined}
              style={lit ? { filter: 'drop-shadow(0 0 4px rgba(228,180,120,0.45))' } : undefined}
            />
          )
        })}
      </g>

      {routeD && (
        <path
          d={routeD}
          fill="none"
          stroke={MAP_COLORS.clay}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="6 6"
          className="hero-route"
        />
      )}

      {dots.map((d) => {
        const pill = pillById.get(d.id)
        return (
          <g key={d.id}>
            <circle cx={d.x} cy={d.y} r="8" fill={MAP_COLORS.deepClay} opacity="0.18" />
            <circle cx={d.x} cy={d.y} r="3.6" fill={MAP_COLORS.clay} stroke={MAP_COLORS.paper} strokeWidth="1" />
            {/* 张数药丸：地图标记自带张数（参考站 mytravelmap.cn 的标记语言），
                文字与描边沿用地图既有配色，不引入新色 */}
            {pill && (
              <g>
                <rect
                  x={pill.x}
                  y={pill.y}
                  width={pill.w}
                  height={24}
                  rx={12}
                  fill={MAP_COLORS.paper}
                  stroke={MAP_COLORS.clay}
                  strokeWidth={1.2}
                  opacity={0.96}
                />
                <text
                  x={pill.x + pill.w / 2}
                  y={pill.y + 16}
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="700"
                  fill={MAP_COLORS.ink}
                >
                  {pill.text}
                </text>
              </g>
            )}
            {labelById.has(d.id) && (
              <text
                x={labelById.get(d.id) === 'l' ? d.x - 13 : d.x + 13}
                y={d.y + 5}
                textAnchor={labelById.get(d.id) === 'l' ? 'end' : 'start'}
                fontSize="15"
                fontWeight="600"
                fill={MAP_COLORS.ink}
                style={{
                  paintOrder: 'stroke',
                  stroke: MAP_COLORS.paper,
                  strokeWidth: 3,
                  strokeLinejoin: 'round',
                }}
              >
                {d.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
