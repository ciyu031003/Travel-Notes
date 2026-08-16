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
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0] flex-shrink-0">
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
