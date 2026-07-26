'use client'

import { useState, useMemo, useRef } from 'react'
import {
  chinaFeatures,
  dashLineFeature,
  makeProjection,
  makePath,
  provinceIdOf,
  type GeoFeature,
} from '@/lib/geo'
import { getProvince } from '@/data/provinces'
import { findProvinceByLocation, getProvinceImage } from '@/lib/province-map'
import { X, MapPin, Calendar, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface PostMeta {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  tags?: string[]
  location?: string
}

interface ChinaMapProps {
  posts: PostMeta[]
}

interface ProvincePath {
  id: string
  d: string
  name: string
  nameEn: string
  lit: boolean
  centroid: [number, number] | null
}

const colors = {
  cream: '#FAFBF7',
  dim: '#D8DDD8',
  ink: '#5A6670',
  sakura: '#F5DCE0',
  bloom: '#E8B8C2',
  sky: '#A8C8DC',
  mist: '#D6E8F0',
}

const easyTapProvinceIds = new Set(['hongkong', 'macau'])

export default function ChinaMap({ posts }: ChinaMapProps) {
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  const containerRef = useRef<HTMLDivElement>(null)

  const width = 1100
  const height = 860

  const postsByProvince = useMemo(() => {
    const map = new Map<string, PostMeta[]>()
    for (const post of posts) {
      if (!post.location) continue
      const province = findProvinceByLocation(post.location)
      if (province) {
        if (!map.has(province.id)) {
          map.set(province.id, [])
        }
        map.get(province.id)!.push(post)
      }
    }
    return map
  }, [posts])

  const { paths, dashPath } = useMemo(() => {
    const projection = makeProjection(width, height, 24)
    const pathGen = makePath(projection)

    const litProvinceIds = new Set(postsByProvince.keys())

    const provincePaths: ProvincePath[] = chinaFeatures.map((feature) => {
      const id = provinceIdOf(feature)
      const province = getProvince(id)
      const d = pathGen(feature as never) || ''
      const centroid = pathGen.centroid(feature as never)
      return {
        id,
        d,
        name: province?.name || id,
        nameEn: province?.nameEn || id,
        lit: litProvinceIds.has(id),
        centroid: centroid[0] || centroid[1] ? [centroid[0], centroid[1]] : null,
      }
    })

    const dashD = dashLineFeature
      ? pathGen(dashLineFeature as never) || ''
      : ''

    return { paths: provincePaths, dashPath: dashD }
  }, [postsByProvince])

  const selectedPosts = selectedProvince
    ? postsByProvince.get(selectedProvince) || []
    : []
  const selectedProvinceInfo = selectedProvince
    ? getProvince(selectedProvince)
    : null
  const selectedHeaderImage = useMemo(() => {
    if (selectedPosts.length === 0) return getProvinceImage(selectedProvince || '')
    const firstPost = selectedPosts[0]
    return firstPost.images?.[0] || firstPost.cover || getProvinceImage(selectedProvince || '')
  }, [selectedPosts, selectedProvince])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onMouseMove={handleMouseMove}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        style={{
          aspectRatio: `${width} / ${height}`,
          filter: 'drop-shadow(0 16px 26px rgba(168,200,220,0.18))',
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

        {/* 外发光层 — lit 省份的柔光晕 */}
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

        {/* 省份路径 */}
        {paths.map((path) => {
          const isHovered = hoveredProvince === path.id
          return (
            <path
              key={path.id}
              d={path.d}
              fill={path.lit ? colors.sakura : colors.dim}
              fillOpacity={path.lit ? 0.68 : 0.34}
              stroke={path.lit ? colors.bloom : colors.ink}
              strokeOpacity={path.lit ? 0.95 : 0.24}
              strokeWidth={path.lit ? 2.2 : 1.25}
              strokeLinejoin="round"
              className="cursor-pointer transition-all duration-300"
              filter={path.lit || isHovered ? 'url(#visitedGlow)' : undefined}
              onMouseEnter={() => setHoveredProvince(path.id)}
              onMouseLeave={() => setHoveredProvince(null)}
              onClick={() => {
                if (postsByProvince.has(path.id)) {
                  setSelectedProvince(path.id)
                }
              }}
            />
          )
        })}

        {/* 像素纹理层 — lit 省份的复古像素感 */}
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

        {/* 南海九段线 */}
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

        {/* 香港/澳门易点击圆圈 */}
        {paths.map((path) => {
          if (!easyTapProvinceIds.has(path.id) || !path.centroid) return null
          const isHK = path.id === 'hongkong'
          return (
            <g
              key={`tap-${path.id}`}
              className="cursor-pointer transition-all duration-300"
              onMouseEnter={() => setHoveredProvince(path.id)}
              onMouseLeave={() => setHoveredProvince(null)}
              onClick={() => {
                if (postsByProvince.has(path.id)) {
                  setSelectedProvince(path.id)
                }
              }}
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

      {/* 南海诸岛 inset 小框 */}
      <SouthChinaSeaInset />

      {/* 悬浮提示 - 带图片预览 */}
      {hoveredProvince && (
        <div
          className="pointer-events-none absolute z-20 transition-opacity duration-200"
          style={{
            left: `${mousePos.x + 16}px`,
            top: `${mousePos.y - 10}px`,
            transform: 'translateY(-50%)',
          }}
        >
          {(() => {
            const p = paths.find((pp) => pp.id === hoveredProvince)
            const provincePosts = postsByProvince.get(hoveredProvince) || []
            const hasPosts = provincePosts.length > 0
            const firstPost = provincePosts[0]
            const previewImage = firstPost?.images?.[0] || firstPost?.cover || (hasPosts ? getProvinceImage(hoveredProvince) : null)

            return (
              <div className="rounded-xl border border-[#D8DDD8]/80 bg-[#FAFBF7]/95 shadow-xl backdrop-blur overflow-hidden" style={{ width: '260px' }}>
                {previewImage && (
                  <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0]">
                    <img
                      src={previewImage}
                      alt={p?.name || ''}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#FAFBF7]/60 via-transparent to-transparent" />
                    {provincePosts.length > 1 && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-[#FAFBF7]/90 backdrop-blur rounded-full text-xs text-[#5A6670] font-medium">
                        +{provincePosts.length - 1}
                      </div>
                    )}
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`inline-block h-2 w-2 rounded-sm ${hasPosts ? 'bg-[#E8B8C2]' : 'bg-[#B9BEC3]'}`} />
                    <span className="font-semibold text-[#5A6670] text-sm">{p?.name}</span>
                  </div>
                  {hasPosts && firstPost ? (
                    <>
                      <p className="text-sm text-[#5A6670] font-medium truncate mb-1">{firstPost.title}</p>
                      <div className="flex items-center gap-3 text-xs text-[#5A6670]/60">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(firstPost.date).toLocaleDateString('zh-CN')}
                        </span>
                        {firstPost.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {firstPost.location}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[#5A6670]/50">{p?.nameEn}</p>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* 图例 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-4 rounded-lg border border-[#D8DDD8]/80 bg-[#FAFBF7]/85 px-4 py-2 text-xs text-[#5A6670] backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#E8B8C2] shadow-[0_0_8px_rgba(232,184,194,0.5)]" />
          已探索
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#B9BEC3]" />
          未探索
        </span>
      </div>

      {/* 选中省份弹窗 */}
      {selectedProvinceInfo && selectedPosts.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setSelectedProvince(null)}
        >
          <div
            className="bg-[#FAFBF7] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-[#D8DDD8]/60"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部图片 */}
            <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#F5DCE0] via-[#D6E8F0] to-[#E8D5E0]">
              <img
                src={selectedHeaderImage}
                alt={selectedProvinceInfo.name}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.opacity = '0'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              <button
                onClick={() => setSelectedProvince(null)}
                className="absolute top-4 right-4 w-9 h-9 bg-white/30 hover:bg-white/40 backdrop-blur rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
              <div className="absolute bottom-4 left-6 right-6">
                <div className="flex items-center gap-2 text-white/85 text-sm mb-1">
                  <MapPin className="w-4 h-4" />
                  <span>{selectedProvinceInfo.nameEn}</span>
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {selectedProvinceInfo.name} · {selectedPosts.length} 篇旅行记录
                </h2>
              </div>
            </div>

            {/* 旅行记录列表 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {selectedPosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/travel/${post.slug}`}
                  className="flex gap-4 p-3 rounded-lg border border-[#D8DDD8]/60 hover:border-[#E8B8C2] hover:bg-[#F5DCE0]/20 transition-all group"
                >
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0]">
                    <img
                      src={post.cover || post.images?.[0] || getProvinceImage(selectedProvinceInfo.id)}
                      alt={post.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="font-semibold text-[#5A6670] group-hover:text-[#5A6670] transition-colors truncate">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-[#5A6670]/60 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(post.date).toLocaleDateString('zh-CN')}
                      </span>
                      {post.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {post.location}
                        </span>
                      )}
                    </div>
                    {post.description && (
                      <p className="text-sm text-[#5A6670]/70 mt-1 line-clamp-1">
                        {post.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center">
                    <ArrowRight className="w-5 h-5 text-[#D8DDD8] group-hover:text-[#E8B8C2] group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SouthChinaSeaInset() {
  return (
    <div className="absolute bottom-4 left-4 w-[116px] h-[162px] rounded-lg border-2 border-[#D8DDD8]/60 bg-[#FAFBF7]/60 backdrop-blur-sm p-1.5 pointer-events-none">
      <svg
        viewBox="0 0 116 162"
        className="w-full h-full"
        role="img"
        aria-label="南海诸岛"
      >
        <text
          x="58"
          y="14"
          textAnchor="middle"
          fontSize="8"
          fill={colors.ink}
          opacity="0.5"
        >
          南海诸岛
        </text>
        <g
          stroke={colors.ink}
          strokeWidth="0.6"
          strokeOpacity="0.25"
          fill="none"
          strokeDasharray="3 2"
        >
          <path d="M 20 30 Q 40 50 30 70 Q 50 90 35 110 Q 55 130 40 150" />
          <path d="M 45 28 Q 65 48 55 68 Q 75 88 60 108 Q 80 128 65 148" />
          <path d="M 70 30 Q 90 50 80 70 Q 100 90 85 110" />
        </g>
        <g fill={colors.bloom} opacity="0.6">
          <circle cx="30" cy="45" r="1.5" />
          <circle cx="50" cy="60" r="1.5" />
          <circle cx="40" cy="80" r="1.5" />
          <circle cx="60" cy="95" r="1.5" />
          <circle cx="35" cy="115" r="1.5" />
          <circle cx="55" cy="130" r="1.5" />
          <circle cx="70" cy="50" r="1.5" />
          <circle cx="80" cy="75" r="1.5" />
        </g>
      </svg>
    </div>
  )
}
