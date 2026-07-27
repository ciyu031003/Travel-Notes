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
import { getCitiesByProvince, findCityByName, type City } from '@/data/cities'
import { findProvinceByLocation } from '@/lib/province-map'
import {
  X, MapPin, Calendar, ArrowRight, Plus, Camera,
  ChevronLeft, ChevronRight, Sparkles, Pencil, Image as ImageIcon,
} from 'lucide-react'
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
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [showCityModal, setShowCityModal] = useState(false)
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

  const citiesByPostLocation = useMemo(() => {
    const cityPostMap = new Map<string, PostMeta[]>()
    for (const post of posts) {
      if (!post.location) continue
      const city = findCityByName(post.location)
      if (city) {
        const key = `${city.name}-${findProvinceByLocation(post.location)?.id || ''}`
        if (!cityPostMap.has(key)) {
          cityPostMap.set(key, [])
        }
        cityPostMap.get(key)!.push(post)
      }
    }
    return cityPostMap
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
    ? getProvince(selectedProvince) ?? null
    : null
  const selectedProvinceCities = selectedProvince
    ? getCitiesByProvince(selectedProvince)
    : []
  const selectedHeaderImage = useMemo(() => {
    if (selectedPosts.length === 0) return null
    const firstPost = selectedPosts[0]
    return firstPost.images?.[0] || firstPost.cover || null
  }, [selectedPosts, selectedProvince])

  const cityPosts = useMemo(() => {
    if (!selectedCity || !selectedProvince) return []
    const key = `${selectedCity.name}-${selectedProvince}`
    return citiesByPostLocation.get(key) || []
  }, [selectedCity, selectedProvince, citiesByPostLocation])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }

  const handleProvinceClick = (provinceId: string) => {
    setSelectedProvince(provinceId)
    setSelectedCity(null)
  }

  const handleCityClick = (city: City) => {
    setSelectedCity(city)
    setShowCityModal(true)
  }

  const closeCityModal = () => {
    setShowCityModal(false)
  }

  const backToProvinceList = () => {
    setSelectedCity(null)
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
              onMouseEnter={() => setHoveredProvince(path.id)}
              onMouseLeave={() => setHoveredProvince(null)}
              onClick={() => handleProvinceClick(path.id)}
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
              onMouseEnter={() => setHoveredProvince(path.id)}
              onMouseLeave={() => setHoveredProvince(null)}
              onClick={() => handleProvinceClick(path.id)}
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

      <SouthChinaSeaInset />

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
            const previewImage = firstPost?.images?.[0] || firstPost?.cover || null

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
                    <span className="text-xs text-[#5A6670]/40">点击查看城市</span>
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
                    <p className="text-xs text-[#5A6670]/50">{p?.nameEn} · {getCitiesByProvince(hoveredProvince).length} 个城市</p>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

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

      {selectedProvinceInfo && !selectedCity && (
        <ProvinceCityPanel
          provinceInfo={selectedProvinceInfo}
          cities={selectedProvinceCities}
          posts={selectedPosts}
          citiesWithPosts={citiesByPostLocation}
          onClose={() => setSelectedProvince(null)}
          onCityClick={handleCityClick}
        />
      )}

      {showCityModal && selectedCity && (
        <CityModal
          city={selectedCity}
          provinceInfo={selectedProvinceInfo}
          cityPosts={cityPosts}
          onClose={closeCityModal}
          onBack={backToProvinceList}
        />
      )}
    </div>
  )
}

function ProvinceCityPanel({
  provinceInfo,
  cities,
  posts,
  citiesWithPosts,
  onClose,
  onCityClick,
}: {
  provinceInfo: { id: string; name: string; nameEn: string }
  cities: City[]
  posts: PostMeta[]
  citiesWithPosts: Map<string, PostMeta[]>
  onClose: () => void
  onCityClick: (city: City) => void
}) {
  return (
    <div className="absolute top-0 right-0 bottom-0 w-[380px] bg-[#FAFBF7]/97 backdrop-blur-md border-l border-[#D8DDD8]/60 shadow-[-12px_0_40px_-8px_rgba(90,102,112,0.12)] flex flex-col z-30 animate-[slideIn_0.3s_ease-out]">
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <div className="flex items-center justify-between p-4 border-b border-[#D8DDD8]/60">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-[#5A6670]">{provinceInfo.name}</h3>
            <p className="text-xs text-[#5A6670]/50">{provinceInfo.nameEn} · {cities.length} 个城市</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-[#D8DDD8]/40 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-[#5A6670]/60" />
        </button>
      </div>

      {posts.length > 0 && (
        <div className="p-4 bg-gradient-to-br from-[#F5DCE0]/30 to-[#D6E8F0]/30 border-b border-[#D8DDD8]/60">
          <div className="flex items-center gap-2 text-xs text-[#5A6670]/60 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#E8B8C2]" />
            <span>该省旅行记录</span>
            <span className="ml-auto font-medium text-[#E8B8C2]">{posts.length}</span>
          </div>
          <div className="space-y-2">
            {posts.slice(0, 2).map((post) => (
              <Link
                key={post.slug}
                href={`/travel/${post.slug}`}
                className="flex items-center gap-3 p-2 rounded-lg bg-[#FAFBF7]/80 hover:bg-white transition-colors group"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0] flex-shrink-0">
                  {(post.cover || post.images?.[0]) ? (
                    <img
                      src={post.cover || post.images?.[0]}
                      alt={post.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-white/50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#5A6670] truncate group-hover:text-[#E8B8C2]">{post.title}</p>
                  <p className="text-xs text-[#5A6670]/50">{post.location}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 text-xs font-medium text-[#5A6670]/50">
          <span>点击城市添加旅行记录</span>
        </div>
        <div className="px-3 pb-3 space-y-1">
          {cities.map((city) => {
            const key = `${city.name}-${provinceInfo.id}`
            const hasPosts = citiesWithPosts.has(key)
            const cityPostCount = citiesWithPosts.get(key)?.length || 0
            return (
              <button
                key={city.id}
                onClick={() => onCityClick(city)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  hasPosts
                    ? 'bg-[#F5DCE0]/30 hover:bg-[#F5DCE0]/50 border border-[#E8B8C2]/30'
                    : 'hover:bg-[#D8DDD8]/30 border border-transparent'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  hasPosts ? 'bg-[#E8B8C2] text-white' : 'bg-[#D8DDD8]/50 text-[#5A6670]/40'
                }`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${hasPosts ? 'text-[#5A6670]' : 'text-[#5A6670]/70'}`}>
                    {city.name}
                  </p>
                  <p className="text-xs text-[#5A6670]/40">{city.nameEn}</p>
                </div>
                {hasPosts ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#E8B8C2] text-white text-xs font-medium">
                    {cityPostCount}
                  </span>
                ) : (
                  <Plus className="w-4 h-4 text-[#5A6670]/30" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CityModal({
  city,
  provinceInfo,
  cityPosts,
  onClose,
  onBack,
}: {
  city: City
  provinceInfo: { id: string; name: string; nameEn: string } | null
  cityPosts: PostMeta[]
  onClose: () => void
  onBack: () => void
}) {
  const [activeTab, setActiveTab] = useState<'view' | 'add'>('view')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[#FAFBF7] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#D8DDD8]/60 animate-[fadeIn_0.2s_ease-out]">
        <style>{`
          @keyframes fadeIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>

        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-[#F5DCE0] via-[#E8D5E0] to-[#D6E8F0]">
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 bg-white/30 hover:bg-white/40 backdrop-blur rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          {provinceInfo && (
            <button
              onClick={onBack}
              className="absolute top-3 left-3 px-3 py-1.5 bg-white/30 hover:bg-white/40 backdrop-blur rounded-lg flex items-center gap-1 text-sm text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {provinceInfo.name}
            </button>
          )}
          <div className="absolute bottom-3 left-4 right-4">
            <div className="flex items-center gap-2 text-white/80 text-xs mb-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>{city.nameEn}</span>
            </div>
            <h2 className="text-xl font-bold text-white">{city.name}</h2>
          </div>
        </div>

        <div className="flex border-b border-[#D8DDD8]/60">
          <button
            onClick={() => setActiveTab('view')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'view'
                ? 'text-[#E8B8C2] border-b-2 border-[#E8B8C2]'
                : 'text-[#5A6670]/60 hover:text-[#5A6670]'
            }`}
          >
            已有记录 ({cityPosts.length})
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'add'
                ? 'text-[#E8B8C2] border-b-2 border-[#E8B8C2]'
                : 'text-[#5A6670]/60 hover:text-[#5A6670]'
            }`}
          >
            <Plus className="w-4 h-4 inline mr-1" />
            添加新记录
          </button>
        </div>

        {activeTab === 'view' && (
          <div className="p-4 max-h-[400px] overflow-y-auto">
            {cityPosts.length > 0 ? (
              <div className="space-y-3">
                {cityPosts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/travel/${post.slug}`}
                    onClick={onClose}
                    className="flex gap-3 p-3 rounded-lg border border-[#D8DDD8]/60 hover:border-[#E8B8C2] hover:bg-[#F5DCE0]/20 transition-all group"
                  >
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0]">
                      {(post.cover || post.images?.[0]) && (
                        <img
                          src={post.cover || post.images?.[0]}
                          alt={post.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-[#5A6670] text-sm truncate">{post.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-[#5A6670]/50 mt-1">
                        <span>{new Date(post.date).toLocaleDateString('zh-CN')}</span>
                      </div>
                      {post.description && (
                        <p className="text-xs text-[#5A6670]/60 mt-1 line-clamp-1">{post.description}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#F5DCE0]/30 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-[#E8B8C2]/60" />
                </div>
                <p className="text-[#5A6670]/50 text-sm mb-4">该城市暂无旅行记录</p>
                <button
                  onClick={() => setActiveTab('add')}
                  className="px-4 py-2 bg-[#E8B8C2] text-white rounded-lg text-sm font-medium hover:bg-[#E8B8C2]/90 transition-colors"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  添加第一条记录
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'add' && (
          <div className="p-4">
            <div className="rounded-xl border border-dashed border-[#D8DDD8] p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] flex items-center justify-center">
                <Camera className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-semibold text-[#5A6670] mb-2">在 {city.name} 添加旅行记录</h3>
              <p className="text-sm text-[#5A6670]/60 mb-4">
                点击下方按钮前往后台创建新的旅行文章，系统会自动关联到该城市
              </p>
              <Link
                href={`/admin/new?location=${encodeURIComponent(city.name)}`}
                onClick={onClose}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E8B8C2] text-white rounded-lg font-medium hover:bg-[#E8B8C2]/90 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                前往创建文章
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
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
