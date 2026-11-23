'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, Calendar, ArrowRight, Image as ImageIcon, WifiOff, CloudOff, Plus, Search } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/mobile/Button'
import { openNewTravel } from '@/lib/mobile/new-travel'
import { findProvinceByLocation } from '@/lib/province-map'
import { findCityByName, type City } from '@/data/cities'
import { travelDetailHref } from '@/lib/routes'
import MobileProvinceDrawer from '@/components/china-map/MobileProvinceDrawer'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { Skeleton, SkeletonCard } from '@/components/mobile/Skeleton'
import { EmptyState } from '@/components/mobile/EmptyState'
import { Stagger } from '@/components/mobile/Stagger'
import { Icon } from '@/components/mobile/Icon'
import { SegmentedControl } from '@/components/mobile/SegmentedControl'
import RemoteImage from '@/components/mobile/RemoteImage'
// E2：地图懒挂载壳（首帧只出等高骨架，正文画完后的空闲/触达才下载 geo chunk）
import TravelMapLazy from '@/components/travel/TravelMapLazy'

interface PostMeta {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  tags?: string[]
  location?: string
  confirmed?: boolean
  /**
   * 只在本地 SQLite 里、还没同步上云（合并逻辑见 lib/modules/offline/travel-read.ts）。
   * 此前这个字段被合并进来却没人渲染，用户看不出"刚建的那本还在队列里"。
   */
  localOnly?: boolean
}

export default function TravelMobileClient({
  posts,
  offline = false,
  onRefresh = async () => {},
}: {
  posts: PostMeta[]
  offline?: boolean
  onRefresh?: () => Promise<unknown> | void
}) {
  const router = useRouter()
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null)
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [drawerExpanded, setDrawerExpanded] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  /**
   * 旅程分类（对齐最新 Demo 的三段筛选）。
   * 归类口径沿用卡片上原本就在用的状态标：confirmed === false → 进行中，其余 → 已归档。
   */
  const [journeyFilter, setJourneyFilter] = useState<'all' | 'active' | 'done'>('all')

  const postsByProvince = useMemo(() => {
    const map = new Map<string, PostMeta[]>()
    for (const post of posts) {
      const province = post.location ? findProvinceByLocation(post.location) : null
      if (province) {
        if (!map.has(province.id)) map.set(province.id, [])
        map.get(province.id)!.push(post)
      }
    }
    return map
  }, [posts])

  const citiesWithPosts = useMemo(() => {
    const map = new Map<string, PostMeta[]>()
    for (const post of posts) {
      const city = post.location ? findCityByName(post.location) : null
      const province = post.location ? findProvinceByLocation(post.location) : null
      if (city) {
        const key = `${city.name}-${province?.id || ''}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(post)
      }
    }
    return map
  }, [posts])

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

  const activeCount = useMemo(() => posts.filter((p) => p.confirmed === false).length, [posts])
  const doneCount = posts.length - activeCount

  /** 当前分类下的旅程；『全部』保持服务端返回顺序 */
  const visiblePosts = useMemo(() => {
    if (journeyFilter === 'all') return posts
    return posts.filter((p) => (journeyFilter === 'active' ? p.confirmed === false : p.confirmed !== false))
  }, [posts, journeyFilter])

  const handleRecord = () => openNewTravel(router)

  const handleProvinceSelect = (provinceId: string) => {
    setSelectedProvinceId(provinceId)
    setSelectedCity(null)
    setDrawerExpanded(false)
  }

  const handleCitySelect = (city: City) => {
    setSelectedCity(city)
  }

  return (
    <div className="relative m-mobile-page m-bottom-nav-safe bg-[var(--m-bg)] text-[var(--m-text)]">
      <PullToRefresh onRefresh={onRefresh}>
        <div className="relative z-10">
        {offline && (
          <div className="m-chip mx-4 mt-3 flex h-auto items-center gap-2 rounded-2xl bg-[var(--m-accent-soft)] px-4 py-3 text-xs text-[var(--m-accent-strong)]">
            <Icon icon={WifiOff} size="sm" className="shrink-0" />
            离线模式：显示本地缓存旅行记录，联网后自动同步
          </div>
        )}

        {/*
          顶部移动标题。
          ⚠️ 「＋ 新建旅行」按钮是**必须的**：此前新建入口只有底部 Dock 中央那个
          无文字加号（且列表页原有的右上角按钮在 96ed895 被删除），真机反馈
          「找不到新建旅行在哪个地方」。这里给出与"旅行记录"标题同屏的可见入口。
        */}
        <header className="m2-gutter m-safe-top flex items-start gap-3 pb-4">
          <div className="min-w-0 flex-1">
            <p className="m2-eyebrow">甜途 · 旅程手帖</p>
            <h1 className="m2-page-title">我的旅程</h1>
            <p className="m2-page-sub">
              <b className="font-semibold text-[var(--m-accent-strong)]">{posts.length}</b> 段旅程 ·{' '}
              <b className="font-semibold text-[var(--m-tone-sun-fg)]">{provincesVisited}</b> 省 ·{' '}
              <b className="font-semibold text-[var(--m-tone-mint-fg)]">{cityCount}</b> 城
            </p>
          </div>
          <Link
            href="/search"
            aria-label="搜索旅程"
            className="m-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--m-surface-solid)] text-[var(--m-muted)] ring-1 ring-[var(--m-line)]"
          >
            <Icon icon={Search} size="md" />
          </Link>
          <Button
            icon={Plus}
            size="sm"
            onClick={handleRecord}
            className="shrink-0"
            aria-label="新建旅程"
          >
            新建
          </Button>
        </header>

        {/* 移动地图：独立迷你卡片，不携带侧栏 */}
        <section className="px-4">
          <div className="m-enter m-card overflow-hidden">
            <div className="relative h-[310px] bg-[linear-gradient(165deg,#FFF8EF,#EAF2F4)]">
              <TravelMapLazy
                posts={posts}
                externalPanel
                onProvinceSelect={handleProvinceSelect}
                onCitySelect={handleCitySelect}
                resetToken={resetToken}
              />
            </div>
            <div className="flex items-center justify-between border-t border-[var(--m-line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon icon={ImageIcon} size="sm" tone="accent" />
                <span className="text-xs font-medium text-[var(--m-muted)]">足迹地图</span>
              </div>
              <span className="rounded-full bg-[var(--m-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--m-accent-strong)]">
                {provincesVisited} / 34 省
              </span>
            </div>
          </div>
        </section>

        {/* 分类筛选：全部 / 进行中 / 已归档（与 Demo 的分段控件一致，地图保持原样不动） */}
        <section className="px-4 pt-6">
          <SegmentedControl
            value={journeyFilter}
            onChange={setJourneyFilter}
            options={[
              { value: 'all', label: `全部 ${posts.length}` },
              { value: 'active', label: `进行中 ${activeCount}` },
              { value: 'done', label: `已归档 ${doneCount}` },
            ]}
          />
        </section>

        {/* 最近旅行：移动端纵向海报流 */}
        <section className="px-4 pt-7">
          <div className="m-section-title">
            <span>最近旅途</span>
            <span className="text-xs text-[var(--m-muted)]">共 {visiblePosts.length} 篇</span>
          </div>

          {posts.length === 0 ? (
            <div className="m-card px-5 py-10 text-center">
              <Icon icon={MapPin} size="lg" tone="faint" className="mx-auto" />
              <p className="mt-3 text-sm text-[var(--m-muted)]">还没有旅行记录</p>
              <Button onClick={handleRecord} className="mt-5">
                记录第一次旅行
              </Button>
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className="m-card px-5 py-10 text-center">
              <Icon icon={MapPin} size="lg" tone="faint" className="mx-auto" />
              <p className="mt-3 text-sm text-[var(--m-muted)]">
                {journeyFilter === 'active' ? '还没有进行中的旅程' : '还没有已归档的旅程'}
              </p>
              <Button
                onClick={() => (journeyFilter === 'active' ? handleRecord() : setJourneyFilter('all'))}
                className="mt-5"
              >
                {journeyFilter === 'active' ? '开始一段新旅程' : '查看全部旅程'}
              </Button>
            </div>
          ) : (
            <Stagger className="space-y-3" delayBase={120} step={40}>
              {visiblePosts.map((post) => {
                const cover = post.cover || post.images?.[0]
                return (
                  <article key={post.slug} className="m-enter m2-card overflow-hidden">
                    <Link href={travelDetailHref(post.slug)} className="m2-trip-row">
                      <span className="m2-trip-thumb">
                        {cover ? (
                          /*
                           * 列表缩略图改走三级变体（-thumbnail 480px）：
                           * 原图单张 8–10MB，0.8Mbps 下一张就要 80s+；变体约 30–60KB。
                           * 旧图没有变体时 RemoteImage 会 onError 逐级回退到原图，功能不坏。
                           */
                          <RemoteImage
                            src={cover}
                            alt={post.title}
                            variant="thumbnail"
                            width={96}
                            height={102}
                            fill
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center">
                            <Icon icon={MapPin} size="md" tone="faint" />
                          </span>
                        )}
                        {post.localOnly && (
                          <span className="absolute inset-x-1 top-1 inline-flex items-center justify-center gap-1 rounded-full bg-black/45 px-1.5 py-1 text-[10px] font-medium text-white backdrop-blur-md">
                            <Icon icon={CloudOff} size="sm" />
                            待同步
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1 py-1">
                        <span className="flex items-center gap-2">
                          <span className={post.confirmed === false ? 'm2-pill m2-pill-honey' : 'm2-pill m2-pill-pink'}>
                            {post.confirmed === false ? '进行中' : '已归档'}
                          </span>
                          {post.location && (
                            <span className="truncate text-[11px] text-[var(--m-faint)]">{post.location}</span>
                          )}
                        </span>
                        <span className="mt-2 block truncate text-[16px] font-bold leading-snug text-[var(--m-text)]">
                          {post.title}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-[var(--m-faint)]">
                          <Icon icon={Calendar} size="sm" />
                          {formatDate(post.date)}
                        </span>
                        {post.description && (
                          <span className="mt-1.5 line-clamp-1 block text-[11px] text-[var(--m-muted)]">
                            {post.description}
                          </span>
                        )}
                        <span className="mt-2 block text-[11px] font-semibold text-[var(--m-accent-strong)]">
                          打开旅行档案
                          <Icon icon={ArrowRight} size="sm" className="ml-1 inline align-[-2px]" />
                        </span>
                      </span>
                    </Link>
                  </article>
                )
              })}
            </Stagger>
          )}
        </section>

        <footer className="px-5 pb-3 pt-10 text-center text-xs text-[var(--m-faint)]">
          甜途 · 用足迹丈量中国
        </footer>

        <MobileProvinceDrawer
          postsByProvince={postsByProvince}
          citiesWithPosts={citiesWithPosts}
          provinceId={selectedProvinceId}
          city={selectedCity}
          expanded={drawerExpanded}
          onToggleExpand={() => setDrawerExpanded((v) => !v)}
          onClose={() => {
            setSelectedProvinceId(null)
            setSelectedCity(null)
            setDrawerExpanded(false)
            setResetToken((t) => t + 1)
          }}
          onCityClick={handleCitySelect}
          onBack={() => setSelectedCity(null)}
        />
        </div>
      </PullToRefresh>
    </div>
  )
}

/** 旅行页移动端加载骨架 / 错误态（替代 AsyncState 整页转圈） */
export function TravelMobileLoading({ message }: { message?: string }) {
  if (message) {
    return (
      <div className="m-safe-top-48 flex min-h-dvh flex-col bg-[var(--m-bg)] text-[var(--m-text)]">
        <EmptyState
          icon={MapPin}
          title="旅行记录加载失败"
          description={message}
          action={<Button onClick={() => window.location.reload()}>重新加载</Button>}
        />
      </div>
    )
  }
  return (
    <div className="min-h-dvh bg-[var(--m-bg)] text-[var(--m-text)]">
      <div className="m-safe-top-40 space-y-5 px-5 pb-10">
        <div>
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-9 w-44" />
          <SkeletonLines2 />
        </div>
        <div className="m-card overflow-hidden">
          {/* 地图容器本身是方角卡内嵌，骨架用 rounded-none 精确复刻（无需 !important） */}
          <Skeleton className="m-0 h-[310px] w-full rounded-none" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

function SkeletonLines2() {
  return (
    <div className="mt-2.5 flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-3 w-28" />
    </div>
  )
}