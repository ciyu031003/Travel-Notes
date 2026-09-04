'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import dynamicImport from 'next/dynamic'
import { MapPin, Calendar, ArrowRight, Plus, Image as ImageIcon, WifiOff } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'
import { findProvinceByLocation } from '@/lib/province-map'
import { findCityByName } from '@/data/cities'

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

export default function TravelMobileClient({
  posts,
  offline = false,
}: {
  posts: PostMeta[]
  offline?: boolean
}) {
  const router = useRouter()

  const provincesVisited = useMemo(() => {
    const set = new Set<string>()
    for (const post of posts) {
      const province = post.location ? findProvinceByLocation(post.location) : null
      if (province) set.add(province.id)
    }
    return set.size
  }, [posts])

  const cityCount = useMemo(() => {
    const set = new Set<string>()
    for (const post of posts) {
      const city = post.location ? findCityByName(post.location) : null
      if (city) set.add(city.name)
    }
    return set.size
  }, [posts])

  const handleRecord = async () => {
    try {
      const res = await fetch('/api/check-auth')
      const data = await res.json().catch(() => null)
      if (data?.authenticated) router.push('/travel?compose=1')
      else router.push('/login?redirect=' + encodeURIComponent('/travel?compose=1'))
    } catch {
      router.push('/login?redirect=' + encodeURIComponent('/travel?compose=1'))
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--m-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[340px] bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(191,205,216,0.26),transparent_72%),radial-gradient(35%_35%_at_100%_0%,rgba(228,180,120,0.12),transparent_60%)]" />

      <div className="relative z-10">
        {offline && (
          <div className="m-chip mx-4 mt-3 flex h-auto items-center gap-2 rounded-2xl bg-[var(--m-accent-soft)] px-4 py-3 text-xs text-[var(--m-accent-strong)]">
            <WifiOff className="h-4 w-4 shrink-0" />
            离线模式：显示本地缓存旅行记录，联网后自动同步
          </div>
        )}

        {/* 顶部移动标题 + 新建入口 */}
        <header className="flex items-end justify-between px-5 pt-[max(26px,env(safe-area-inset-top))] pb-5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.22em] text-[var(--m-accent-strong)]">MY JOURNEYS</p>
            <h1 className="mt-2 text-[32px] font-bold leading-none tracking-[-0.03em] text-[var(--m-text)]">旅行记录</h1>
            <p className="mt-2 text-sm text-[var(--m-muted)]">
              {posts.length} 篇旅途 · {provincesVisited} 个省 · {cityCount} 个城市
            </p>
          </div>
          <button
            type="button"
            onClick={handleRecord}
            aria-label="记录旅行"
            className="m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#D58A58,#A85F3A)] text-white shadow-[0_12px_26px_-10px_rgba(168,95,58,0.55)]"
          >
            <Plus className="h-6 w-6" strokeWidth={2.6} />
          </button>
        </header>

        {/* 移动地图：独立迷你卡片，不携带侧栏 */}
        <section className="px-4">
          <div className="m-enter m-card overflow-hidden">
            <div className="relative h-[310px] bg-[linear-gradient(165deg,#FFF8EF,#EAF2F4)]">
              <ChinaMap posts={posts} />
            </div>
            <div className="flex items-center justify-between border-t border-[var(--m-line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-[var(--m-accent)]" />
                <span className="text-xs font-medium text-[var(--m-muted)]">足迹地图</span>
              </div>
              <span className="rounded-full bg-[var(--m-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--m-accent-strong)]">
                {provincesVisited} / 34 省
              </span>
            </div>
          </div>
        </section>

        {/* 最近旅行：移动端纵向海报流 */}
        <section className="px-4 pt-9">
          <div className="m-section-title">
            <span>最近旅途</span>
            <span className="text-xs text-[var(--m-muted)]">共 {posts.length} 篇</span>
          </div>

          {posts.length === 0 ? (
            <div className="m-card px-5 py-10 text-center">
              <MapPin className="mx-auto h-8 w-8 text-[var(--m-faint)]" />
              <p className="mt-3 text-sm text-[var(--m-muted)]">还没有旅行记录</p>
              <button
                type="button"
                onClick={handleRecord}
                className="m-chip m-chip-active mt-5 !h-11 !px-5 !text-sm"
              >
                记录第一次旅行
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post, index) => {
                const cover = post.cover || post.images?.[0]
                return (
                  <Link
                    key={post.slug}
                    href={`/travel/${post.slug}`}
                    className={cn(
                      'm-enter m-press block overflow-hidden rounded-[26px] border border-[var(--m-line)] bg-[var(--m-surface-solid)] shadow-[var(--m-shadow-sm)]',
                      index % 2 === 1 && 'rounded-[30px] border-[var(--m-line-strong)]',
                    )}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,var(--m-bg-soft),var(--m-surface-2))]">
                      {cover ? (
                        <Image
                          src={cover}
                          alt={post.title}
                          fill
                          sizes="100vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <MapPin className="h-10 w-10 text-[var(--m-faint)]" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(26,16,9,0.62),rgba(26,16,9,0)_65%)]" />
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        {post.location && (
                          <span className="m-chip !border-white/18 !bg-white/16 !text-white">
                            {post.location}
                          </span>
                        )}
                        <span className="mt-2 line-clamp-1 text-[22px] font-bold tracking-tight text-white">{post.title}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="flex items-center gap-1.5 text-xs text-[var(--m-muted)]">
                        <Calendar className="h-4 w-4 text-[var(--m-accent)]" />
                        {formatDate(post.date)}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-[var(--m-accent-strong)]">
                        阅读游记
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <footer className="px-5 pb-3 pt-10 text-center text-xs text-[var(--m-faint)]">
          行迹 · 用足迹丈量中国
        </footer>
      </div>
    </div>
  )
}
