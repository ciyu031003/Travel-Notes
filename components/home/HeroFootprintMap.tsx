'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getProvinceByAdcode } from '@/data/provinces'
import { findProvinceByLocation } from '@/lib/province-map'
import { postPhotoCount } from '@/lib/home/photo-count'
import { loadMapArtifact, type ArtifactProvince, type MapArtifact } from '@/lib/map-artifact'
import type { PostMeta } from '@/components/ChinaMap'

const WIDTH = 1100
const HEIGHT = 860

/**
 * 几何数据按需加载（F1，2026-11-23：几何预计算进安装包）
 * ---------------------------------------------------------------------------
 * 旧实现动态 import('@/lib/geo')：569KB 的中国 GeoJSON + d3-geo（约 202KB gz 的独立 chunk），
 * 拿到后还要在客户端做投影 + 34 路径生成 + 每省质心计算。
 *
 * 现在几何在构建期算好（scripts/gen-map-artifact.mjs → public/map/china-paths.v1.json），
 * 这里只 fetch 一次 JSON（模块级 Promise 去重，与 ChinaMap 共享同一次请求）：
 * 拿到省份路径与质心直接用，客户端零投影。
 *
 * 仍然是两段式（这张插图在移动端首页位于「足迹卡片」里，首屏之下）：
 *  ① IntersectionObserver 等宿主容器**进入视口**；
 *  ② 再 fetch 产物，拿到后画 SVG。
 * 未进入视口时只渲染同尺寸空容器（父级卡片本身有渐变底色，不跳动、不闪骨架）；
 * display:none 的隐藏树不会被判定为 intersecting，所以移动端不会因桌面树偷偷加载。
 */
type ArtifactProvinceWithName = ArtifactProvince & { name: string }

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
  const hostRef = useRef<HTMLDivElement | null>(null)
  /** 是否已经进入（或接近）视口 —— 决定要不要去拉几何产物 */
  const [nearViewport, setNearViewport] = useState(false)
  const [artifact, setArtifact] = useState<MapArtifact | null>(null)

  // ① 视口门控：进入视口前不加载地理数据（首屏 JS 里不再包含它）
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    if (typeof IntersectionObserver !== 'function') {
      // 老 WebView 没有 IO：退回「挂载即加载」，保证地图一定画得出来
      setNearViewport(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
          io.disconnect()
        }
      },
      /**
       * threshold 0.5 而不是「碰到一点点就加载」：
       * 移动端首页 390×844 下，足迹卡片的地图区从 y≈796 开始（底部只露出 48px）。
       * 只要「露一条边」就加载，等于首屏还是得为这 202KB gz 付费；
       * 要求露出一半（≈88px）之后才加载，用户真正往下滚动时图才进来 ——
       * 未加载期间容器保持卡片自身的渐变底色与底部覆盖条，视觉上是「还没画图」而不是骨架闪烁。
       */
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // ② 加载几何产物（模块级 Promise 去重：首页 hero 与 /travel 地图共用一次请求）
  useEffect(() => {
    if (!nearViewport || artifact) return
    let cancelled = false
    loadMapArtifact().then(
      (value) => {
        if (!cancelled) setArtifact(value)
      },
      () => {
        // 拉取失败：保持只有容器底色，不阻塞页面其它部分（模块级 Promise 已清空，下次进入重试）
      },
    )
    return () => {
      cancelled = true
    }
  }, [nearViewport, artifact])

  const derived = useMemo(() => {
    if (!artifact) return null
    /** 省份 id -> 产物几何（adcode 映射回 id；名称仍来自 data/provinces） */
    const geometryById = new Map<string, ArtifactProvinceWithName>()
    const provincePaths: { id: string; d: string }[] = []
    for (const province of artifact.provinces) {
      const meta = getProvinceByAdcode(province.adcode)
      if (!meta) continue
      geometryById.set(meta.id, { ...province, name: meta.name })
      provincePaths.push({ id: meta.id, d: province.d })
    }

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
      const province = geometryById.get(id)
      if (!province || !province.centroid) continue
      // 质心在构建期已四舍五入到 2 位小数，SSR/客户端不会出现浮点差异
      const [x, y] = province.centroid
      centroids.push([x, y])
      dots.push({ id, x, y, count: info.count, photos: info.photos, name: info.name })
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
      const others = dots.filter((o) => o.id !== d.id).map((o) => ({ x: o.x, y: o.y }))
      const crowded = [...placed, ...pillSpots, ...others]
        .some((p) => Math.abs(p.x - d.x) < NEAR_X && Math.abs(p.y - d.y) < NEAR_Y)
      if (crowded) continue
      labelById.set(d.id, placed.length % 2 === 0 ? 'l' : 'r')
      placed.push({ x: d.x, y: d.y })
    }

    return { provincePaths, litIds, routeD, dots, labelById, pillById: new Map(pills.map((p) => [p.id, p])) }
  }, [artifact, posts, countBadges])

  return (
    <div ref={hostRef} className="h-full w-full">
      {derived ? (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
          aria-hidden="true"
        >
          <g strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
            {derived.provincePaths.map((p) => {
              const lit = derived.litIds.has(p.id)
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

          {derived.routeD && (
            <path
              d={derived.routeD}
              fill="none"
              stroke={MAP_COLORS.clay}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeDasharray="6 6"
              className="hero-route"
            />
          )}

          {derived.dots.map((d) => {
            const pill = derived.pillById.get(d.id)
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
                {derived.labelById.has(d.id) && (
                  <text
                    x={derived.labelById.get(d.id) === 'l' ? d.x - 13 : d.x + 13}
                    y={d.y + 5}
                    textAnchor={derived.labelById.get(d.id) === 'l' ? 'end' : 'start'}
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
      ) : null}
    </div>
  )
}
