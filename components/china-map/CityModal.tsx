'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  X, MapPin, ArrowRight, Plus, Camera, ChevronLeft, Pencil, Image as ImageIcon,
} from 'lucide-react'
import type { City } from '@/data/cities'
import type { PostMeta } from './types'

export default function CityModal({
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
                        <Image
                          src={post.cover || post.images?.[0] || ''}
                          alt={post.title}
                          fill
                          sizes="64px"
                          className="object-cover"
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
