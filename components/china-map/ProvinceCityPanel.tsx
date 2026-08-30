'use client'

import Link from 'next/link'
import Image from 'next/image'
import { X, MapPin, Sparkles, Plus } from 'lucide-react'
import type { City } from '@/data/cities'
import type { PostMeta } from './types'

export default function ProvinceCityPanel({
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
    <>
      {/* 移动端遮罩：点击关闭（桌面端右侧滑入不需要） */}
      <div data-map-overlay className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={onClose} />

      <div data-map-overlay className="fixed inset-x-0 bottom-0 h-[60vh] z-50 rounded-t-2xl animate-[slideUp_0.3s_ease-out] md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[min(380px,100%)] md:rounded-none md:animate-[slideIn_0.3s_ease-out] bg-travel-cream/97 backdrop-blur-md border-t md:border-t-0 md:border-l border-travel-dim/60 shadow-[-12px_0_40px_-8px_rgba(90,102,112,0.12)] flex flex-col">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>

        {/* 移动端拖拽把手 */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="w-10 h-1 rounded-full bg-travel-dim/70" />
        </div>

        <div className="flex items-center justify-between p-4 pt-2 md:pt-4 border-b border-travel-dim/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-travel-sakura to-travel-bloom flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-travel-ink">{provinceInfo.name}</h3>
              <p className="text-xs text-travel-ink/50">{provinceInfo.nameEn} · {cities.length} 个城市</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-travel-dim/40 flex items-center justify-center transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4 text-travel-ink/60" />
          </button>
        </div>

        {posts.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-travel-sakura/30 to-travel-mist/30 border-b border-travel-dim/60 shrink-0">
            <div className="flex items-center gap-2 text-xs text-travel-ink/60 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-travel-bloom" />
              <span>该省旅行记录</span>
              <span className="ml-auto font-medium text-travel-bloom">{posts.length}</span>
            </div>
            <div className="space-y-2">
              {posts.slice(0, 2).map((post) => (
                <Link
                  key={post.slug}
                  href={`/travel/${post.slug}`}
                  className="flex items-center gap-3 p-2 rounded-lg bg-travel-cream/80 hover:bg-white transition-colors group"
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-travel-sakura to-travel-mist flex-shrink-0">
                    {(post.cover || post.images?.[0]) ? (
                      <Image
                        src={post.cover || post.images?.[0] || ''}
                        alt={post.title}
                        fill
                        sizes="48px"
                        className="object-cover"
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
                    <p className="text-sm font-medium text-travel-ink truncate group-hover:text-travel-bloom">{post.title}</p>
                    <p className="text-xs text-travel-ink/50">{post.location}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="p-3 text-xs font-medium text-travel-ink/50">
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
                      ? 'bg-travel-sakura/30 hover:bg-travel-sakura/50 border border-travel-bloom/30'
                      : 'hover:bg-travel-dim/30 border border-transparent'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    hasPosts ? 'bg-travel-bloom text-white' : 'bg-travel-dim/50 text-travel-ink/40'
                  }`}>
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${hasPosts ? 'text-travel-ink' : 'text-travel-ink/70'}`}>
                      {city.name}
                    </p>
                    <p className="text-xs text-travel-ink/40">{city.nameEn}</p>
                  </div>
                  {hasPosts ? (
                    <span className="px-2 py-0.5 rounded-full bg-travel-bloom text-white text-xs font-medium">
                      {cityPostCount}
                    </span>
                  ) : (
                    <Plus className="w-4 h-4 text-travel-ink/30" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
