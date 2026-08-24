'use client'

import { Calendar, MapPin } from 'lucide-react'
import Image from 'next/image'
import { getCitiesByProvince } from '@/data/cities'
import type { PostMeta, ProvincePath } from './types'

interface ProvinceTooltipProps {
  province: ProvincePath | undefined
  provincePosts: PostMeta[]
  mousePos: { x: number; y: number }
}

export default function ProvinceTooltip({
  province,
  provincePosts,
  mousePos,
}: ProvinceTooltipProps) {
  const p = province
  const hasPosts = provincePosts.length > 0
  const firstPost = provincePosts[0]
  const previewImage = firstPost?.images?.[0] || firstPost?.cover || null

  return (
    <div
      className="pointer-events-none absolute z-20 transition-opacity duration-200"
      style={{
        left: `${mousePos.x + 16}px`,
        top: `${mousePos.y - 10}px`,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="rounded-xl border border-travel-dim/80 bg-travel-cream/95 shadow-xl backdrop-blur overflow-hidden" style={{ width: '260px' }}>
        {previewImage && (
          <div className="relative h-36 overflow-hidden bg-gradient-to-br from-travel-sakura to-travel-mist">
            <Image
              src={previewImage}
              alt={p?.name || ''}
              fill
              sizes="260px"
              className="object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-travel-cream/60 via-transparent to-transparent" />
            {provincePosts.length > 1 && (
              <div className="absolute top-2 right-2 px-2 py-0.5 bg-travel-cream/90 backdrop-blur rounded-full text-xs text-travel-ink font-medium">
                +{provincePosts.length - 1}
              </div>
            )}
          </div>
        )}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${hasPosts ? 'bg-travel-bloom' : 'bg-[#B9BEC3]'}`} />
            <span className="font-semibold text-travel-ink text-sm">{p?.name}</span>
            <span className="text-xs text-travel-ink/40">点击查看城市</span>
          </div>
          {hasPosts && firstPost ? (
            <>
              <p className="text-sm text-travel-ink font-medium truncate mb-1">{firstPost.title}</p>
              <div className="flex items-center gap-3 text-xs text-travel-ink/60">
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
            <p className="text-xs text-travel-ink/50">{p?.nameEn} · {getCitiesByProvince(p?.id || '').length} 个城市</p>
          )}
        </div>
      </div>
    </div>
  )
}
