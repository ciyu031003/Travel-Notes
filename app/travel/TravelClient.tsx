'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatDate } from '@/lib/utils'
import { MapPin, Calendar, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Image as ImageIcon, Info, Lock, Settings2 } from 'lucide-react'
import dynamicImport from 'next/dynamic'
import ManageEntry from '@/components/layout/ManageEntry'
import TravelImageCarousel from '@/components/TravelImageCarousel'
import TravelInfoPanel from '@/components/TravelInfoPanel'
import AlbumUnlockModal from '@/components/AlbumUnlockModal'
import { findProvinceByLocation } from '@/lib/province-map'
import { findCityByName } from '@/data/cities'

// v3.1 M3-D2：ChinaMap 重组件按需加载（首屏不打包）
const ChinaMap = dynamicImport(() => import('@/components/ChinaMap'), { ssr: false })

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
  offline?: boolean
}

export default function TravelClient({ posts, offline = false }: TravelClientProps) {
  const [showAll, setShowAll] = useState(false)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [anniversaryStart, setAnniversaryStart] = useState<string | undefined>(undefined)
  const [showAlbumUnlock, setShowAlbumUnlock] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const visiblePosts = showAll ? posts : posts.slice(0, 6)

  // 移动端默认收起左右面板，避免遮挡 40vh 小地图（桌面保持默认展开）
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (isMobile) {
      setLeftOpen(false)
      setRightOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    fetch('/api/travel/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.anniversaryStart) {
          setAnniversaryStart(data.anniversaryStart)
        }
      })
      .catch(() => {})
  }, [])

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

  const carouselImages = useMemo(() => {
    const images: string[] = []
    const seen = new Set<string>()
    for (const post of posts) {
      const urls = [post.cover, ...(post.images || [])].filter(Boolean) as string[]
      for (const url of urls) {
        if (!seen.has(url)) {
          seen.add(url)
          images.push(url)
        }
      }
    }
    return images
  }, [posts])

  const citiesWithMemories = useMemo(() => {
    const set = new Set<string>()
    for (const post of posts) {
      if (post.location) {
        const city = findCityByName(post.location)
        if (city) set.add(city.name)
      }
    }
    return set.size
  }, [posts])

  const weatherCities = useMemo(() => {
    const cityNames: string[] = []
    const seen = new Set<string>()
    for (const post of posts) {
      if (post.location) {
        const city = findCityByName(post.location)
        if (city && !seen.has(city.name)) {
          seen.add(city.name)
          cityNames.push(city.name)
        }
      }
    }
    return cityNames.slice(0, 3)
  }, [posts])

  return (
    <div className="relative min-h-screen bg-travel-cream text-travel-ink pb-24 md:pb-0">
      {/* 底部雾气带 */}
      <div
        className="fixed inset-x-0 bottom-0 h-[40vh] pointer-events-none opacity-40"
        style={{
          background:
            'linear-gradient(to bottom, rgba(214,232,240,0) 0%, rgba(214,232,240,0.28) 50%, rgba(214,232,240,0.18) 100%)',
        }}
      />

      {/* 顶部导航（旅行工作区专用，与全局 Navbar 同风格） */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-travel-cream/80 backdrop-blur-md border-b border-travel-line/50 dark:border-shell-line">        <nav className="w-full mx-auto h-14 flex items-center justify-between px-4 md:px-8">
          <Link
            href="/"
            className="font-bold text-lg text-travel-inkStrong dark:text-shell-text"
          >
            行迹
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-4 py-2 text-sm text-travel-ink/80 hover:text-travel-ink transition-colors"
            >
              返回首页
            </Link>
            <button
              onClick={() => setShowAlbumUnlock(true)}
              className="px-4 py-2 text-sm text-travel-ink/80 hover:text-travel-ink transition-colors flex items-center gap-1.5"
            >
              <ImageIcon className="w-4 h-4" />
              相册
            </button>
            <ManageEntry
              href="/admin/travels"
              label="管理旅行"
              icon={<Settings2 className="w-4 h-4" />}
              className="px-4 py-2 text-sm text-travel-ink/80 hover:text-travel-ink transition-colors"
            />
          </div>
        </nav>
      </header>

      {/* 主要内容 */}
      <div className="relative z-10 pt-14">
        {offline && (
          <div className="bg-travel-bloom/15 border-b border-travel-bloom/30 px-6 py-2 text-center text-xs text-travel-accent dark:text-travel-bloom">
            离线模式：当前显示本地缓存的旅行记录，联网后自动同步
          </div>
        )}
        {/* 地图区 - 可收起侧边栏布局（移动端 40vh，列表前置） */}
        <section className="relative h-[40vh] md:h-[calc(100vh-56px)] overflow-hidden">
          {/* 地图容器 */}
          <div className="absolute inset-0 p-2 md:p-4">
            <div className="w-full h-full rounded-2xl border border-travel-dim/60 bg-travel-cream p-3 md:p-5 shadow-[0_10px_28px_rgba(90,102,112,0.08)]">
              <ChinaMap posts={posts} />
            </div>
          </div>

          {/* 移动端胶囊入口：面板收起时快捷打开照片/足迹 */}
          {isMobile && !leftOpen && !rightOpen && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex gap-2 md:hidden">
              <button
                onClick={() => setLeftOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-travel-cream/90 border border-travel-dim/80 shadow-md text-xs text-travel-ink backdrop-blur transition-colors hover:bg-travel-sakura/30"
              >
                <ImageIcon className="w-3.5 h-3.5 text-travel-bloom" />
                照片
              </button>
              <button
                onClick={() => setRightOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-travel-cream/90 border border-travel-dim/80 shadow-md text-xs text-travel-ink backdrop-blur transition-colors hover:bg-travel-mist/30"
              >
                <Info className="w-3.5 h-3.5 text-travel-bloom" />
                足迹
              </button>
            </div>
          )}

          {/* 左侧可收起面板 */}
          <div
            className={`absolute left-0 top-0 h-full transition-all duration-300 z-20 ${
              leftOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="h-full flex items-stretch">
              <div className="w-64 xl:w-72 h-full p-2">
                <TravelImageCarousel
                  images={carouselImages}
                  intervalMs={8000}
                />
              </div>
              {/* 收起按钮 */}
              <button
                onClick={() => setLeftOpen(false)}
                className="w-6 h-12 self-center bg-travel-cream border border-travel-dim rounded-r-lg flex items-center justify-center hover:bg-travel-sakura/30 transition-colors shadow-md"
                aria-label="收起左侧面板"
              >
                <ChevronLeft className="w-4 h-4 text-travel-ink" />
              </button>
            </div>
          </div>

          {/* 左侧展开按钮 */}
          {!leftOpen && (
            <button
              onClick={() => setLeftOpen(true)}
              className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-12 bg-travel-cream border border-travel-dim border-l-0 rounded-r-lg flex items-center justify-center hover:bg-travel-sakura/30 transition-colors shadow-md z-30"
              aria-label="展开左侧面板"
            >
              <ChevronRight className="w-4 h-4 text-travel-ink" />
            </button>
          )}

          {/* 右侧可收起面板 */}
          <div
            className={`absolute right-0 top-0 h-full transition-all duration-300 z-20 ${
              rightOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="h-full flex items-stretch flex-row-reverse">
              <div className="w-64 xl:w-72 h-full p-2">
                <TravelInfoPanel
                  anniversaryStart={anniversaryStart}
                  cities={weatherCities.length > 0 ? weatherCities : ['北京', '上海', '广州']}
                  provincesLit={provincesVisited.size}
                  totalProvinces={34}
                  citiesWithMemories={citiesWithMemories}
                  totalCities={300}
                />
              </div>
              {/* 收起按钮 */}
              <button
                onClick={() => setRightOpen(false)}
                className="w-6 h-12 self-center bg-travel-cream border border-travel-dim rounded-l-lg flex items-center justify-center hover:bg-travel-mist/30 transition-colors shadow-md"
                aria-label="收起右侧面板"
              >
                <ChevronRight className="w-4 h-4 text-travel-ink" />
              </button>
            </div>
          </div>

          {/* 右侧展开按钮 */}
          {!rightOpen && (
            <button
              onClick={() => setRightOpen(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-12 bg-travel-cream border border-travel-dim border-r-0 rounded-l-lg flex items-center justify-center hover:bg-travel-mist/30 transition-colors shadow-md z-30"
              aria-label="展开右侧面板"
            >
              <ChevronLeft className="w-4 h-4 text-travel-ink" />
            </button>
          )}
        </section>

        {/* 旅行记录列表 */}
        <section className="px-6 pb-16">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-travel-ink flex items-center gap-2">
                <span className="w-1 h-6 rounded-full bg-travel-bloom" />
                全部旅行记录
              </h2>
              <span className="text-sm text-travel-ink/50">
                共 {posts.length} 篇
              </span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visiblePosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/travel/${post.slug}`}
                  className="group rounded-xl border border-travel-dim/60 bg-travel-cream overflow-hidden hover:shadow-[0_10px_30px_rgba(90,102,112,0.12)] hover:border-travel-bloom/60 transition-all hover:-translate-y-0.5"
                >
                  {/* 封面图 */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-travel-sakura via-[#E8D5E0] to-travel-mist">
                    {(post.cover || post.images?.[0]) ? (
                      <Image
                        src={post.cover || post.images?.[0] || ''}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <MapPin className="w-12 h-12 text-white/40" />
                      </div>
                    )}
                    {post.location && (
                      <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 bg-travel-cream/85 backdrop-blur rounded-full text-xs text-travel-ink">
                        <MapPin className="w-3 h-3 text-travel-bloom" />
                        {post.location}
                      </div>
                    )}
                  </div>

                  {/* 内容 */}
                  <div className="p-4">
                    <h3 className="font-semibold text-travel-ink mb-2 group-hover:text-travel-ink line-clamp-1">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-travel-ink/50 mb-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(post.date)}
                      </span>
                    </div>
                    {post.description && (
                      <p className="text-sm text-travel-ink/60 line-clamp-2">
                        {post.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-3 text-travel-bloom text-sm font-medium">
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
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-travel-cream border border-travel-dim/80 rounded-full text-sm text-travel-ink hover:border-travel-bloom/60 hover:bg-travel-sakura/10 transition-all"
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
        <footer className="relative z-10 border-t border-travel-dim/50 py-8 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-travel-ink/50 text-sm">
              © {new Date().getFullYear()} 行迹 · 用足迹丈量中国
            </p>
          </div>
        </footer>
      </div>

      {/* 相册解锁弹窗 */}
      <AlbumUnlockModal
        isOpen={showAlbumUnlock}
        onClose={() => setShowAlbumUnlock(false)}
      />
    </div>
  )
}
