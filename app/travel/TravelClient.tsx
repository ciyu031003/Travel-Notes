'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { MapPin, Calendar, ArrowRight, ChevronDown } from 'lucide-react'
import ChinaMap from '@/components/ChinaMap'
import { findProvinceByLocation } from '@/lib/province-map'

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

interface TravelClientProps {
  posts: PostMeta[]
}

export default function TravelClient({ posts }: TravelClientProps) {
  const [showAll, setShowAll] = useState(false)
  const visiblePosts = showAll ? posts : posts.slice(0, 6)

  const provincesVisited = useMemo(() => {
    const set = new Set<string>()
    for (const post of posts) {
      if (post.location) {
        const p = findProvinceByLocation(post.location)
        if (p) set.add(p.id)
      }
    }
    return set
  }, [posts])

  if (posts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFBF7]">
        <div className="text-center text-[#5A6670]">
          <MapPin className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-xl">还没有旅行记录，开启你们的第一段旅程吧~</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#FAFBF7] text-[#5A6670]">
      {/* 底部雾气带 */}
      <div
        className="fixed inset-x-0 bottom-0 h-[40vh] pointer-events-none opacity-40"
        style={{
          background:
            'linear-gradient(to bottom, rgba(214,232,240,0) 0%, rgba(214,232,240,0.28) 50%, rgba(214,232,240,0.18) 100%)',
        }}
      />

      {/* 顶部导航 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAFBF7]/80 backdrop-blur-md border-b border-[#D8DDD8]/50">
        <nav className="max-w-7xl mx-auto h-14 flex items-center justify-between px-6">
          <Link
            href="/"
            className="font-bold text-lg text-[#5A6670]"
          >
            Travel Journal
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-4 py-2 text-sm text-[#5A6670]/70 hover:text-[#5A6670] transition-colors"
            >
              返回首页
            </Link>
            <Link
              href="/notes"
              className="px-4 py-2 text-sm bg-[#5A6670] text-[#FAFBF7] rounded-lg hover:bg-[#5A6670]/90 transition-colors"
            >
              学习笔记
            </Link>
          </div>
        </nav>
      </header>

      {/* 主要内容 */}
      <div className="relative z-10 pt-20">
        {/* 标题区 */}
        <section className="px-6 py-10">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 text-[#5A6670] rounded-full text-sm mb-6">
              <MapPin className="w-3.5 h-3.5 text-[#E8B8C2]" />
              <span>走遍中国 · Travel Map</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-[#5A6670]">
              我们的旅行地图
            </h1>
            <p className="text-base text-[#5A6670]/60 max-w-xl mx-auto mb-6">
              点击高亮的省份，查看我们在那里留下的旅行记忆
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-[#FAFBF7] border border-[#D8DDD8]/80 rounded-full text-sm">
                <span className="w-2 h-2 rounded-full bg-[#E8B8C2] shadow-[0_0_6px_rgba(232,184,194,0.5)]" />
                <span>{provincesVisited.size} 个省份已探索</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-[#FAFBF7] border border-[#D8DDD8]/80 rounded-full text-sm">
                <Calendar className="w-3.5 h-3.5 text-[#5A6670]/50" />
                <span>{posts.length} 篇旅行记录</span>
              </div>
            </div>
          </div>
        </section>

        {/* 地图区 */}
        <section className="px-6 pb-12">
          <div className="max-w-6xl mx-auto">
            <div className="rounded-2xl border border-[#D8DDD8]/60 bg-[#FAFBF7] p-4 md:p-6 shadow-[0_10px_28px_rgba(90,102,112,0.08)]">
              <ChinaMap posts={posts} />
            </div>
          </div>
        </section>

        {/* 旅行记录列表 */}
        <section className="px-6 pb-16">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#5A6670] flex items-center gap-2">
                <span className="w-1 h-6 rounded-full bg-[#E8B8C2]" />
                全部旅行记录
              </h2>
              <span className="text-sm text-[#5A6670]/50">
                共 {posts.length} 篇
              </span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visiblePosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/travel/${post.slug}`}
                  className="group rounded-xl border border-[#D8DDD8]/60 bg-[#FAFBF7] overflow-hidden hover:shadow-[0_10px_30px_rgba(90,102,112,0.12)] hover:border-[#E8B8C2]/60 transition-all hover:-translate-y-0.5"
                >
                  {/* 封面图 */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-[#D8DDD8]/20">
                    {post.cover ? (
                      <img
                        src={post.cover}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div
                        className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                        style={{
                          backgroundImage: `url('https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=beautiful%20travel%20landscape%20${encodeURIComponent(
                            post.title
                          )}%20${encodeURIComponent(
                            post.location || ''
                          )}&image_size=landscape_16_9')`,
                        }}
                      />
                    )}
                    {post.location && (
                      <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 bg-[#FAFBF7]/85 backdrop-blur rounded-full text-xs text-[#5A6670]">
                        <MapPin className="w-3 h-3 text-[#E8B8C2]" />
                        {post.location}
                      </div>
                    )}
                  </div>

                  {/* 内容 */}
                  <div className="p-4">
                    <h3 className="font-semibold text-[#5A6670] mb-2 group-hover:text-[#5A6670] line-clamp-1">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-[#5A6670]/50 mb-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(post.date)}
                      </span>
                    </div>
                    {post.description && (
                      <p className="text-sm text-[#5A6670]/60 line-clamp-2">
                        {post.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-3 text-[#E8B8C2] text-sm font-medium">
                      <span>阅读游记</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {posts.length > 6 && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#FAFBF7] border border-[#D8DDD8]/80 rounded-full text-sm text-[#5A6670] hover:border-[#E8B8C2]/60 hover:bg-[#F5DCE0]/10 transition-all"
                >
                  {showAll ? '收起' : `查看全部 ${posts.length} 篇`}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      showAll ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 底部 */}
        <footer className="relative z-10 border-t border-[#D8DDD8]/50 py-8 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-[#5A6670]/50 text-sm">
              © {new Date().getFullYear()} Travel Journal · 用足迹丈量中国
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
