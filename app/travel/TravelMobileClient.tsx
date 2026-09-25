'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import dynamicImport from 'next/dynamic'
import { MapPin, Calendar, ArrowRight, Image as ImageIcon, WifiOff, CloudOff, Plus } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'
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
import { CountUp } from '@/components/mobile/CountUp'
import { Icon } from '@/components/mobile/Icon'
import { StatRow } from '@/components/mobile/StatBlock'

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
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--m-text)]">
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
        <header className="m-gutter m-safe-top flex items-start justify-between gap-3 pb-5">
          <div className="min-w-0">
            <p className="m-label text-[var(--m-accent-strong)]">MY JOURNEYS</p>
            <h1 className="m-title-1 mt-2 text-[var(--m-text)]">旅行记录</h1>
            <StatRow
              className="mt-2"
              items={[
                { value: <CountUp value={posts.length} />, unit: '篇旅途' },
                { value: <CountUp value={provincesVisited} />, unit: '个省' },
                { value: <CountUp value={cityCount} />, unit: '个城市' },
              ]}
            />
          </div>
          <Button
            icon={Plus}
            onClick={handleRecord}
            className="mt-1 shrink-0"
            aria-label="新建旅行"
          >
            新建旅行
          </Button>
        </header>

        {/* 移动地图：独立迷你卡片，不携带侧栏 */}
        <section className="px-4">
          <div className="m-enter m-card overflow-hidden">
            <div className="relative h-[310px] bg-[linear-gradient(165deg,#FFF8EF,#EAF2F4)]">
              <ChinaMap
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

        {/* 最近旅行：移动端纵向海报流 */}
        <section className="px-4 pt-9">
          <div className="m-section-title">
            <span>最近旅途</span>
            <span className="text-xs text-[var(--m-muted)]">共 {posts.length} 篇</span>
          </div>

          {posts.length === 0 ? (
            <div className="m-card px-5 py-10 text-center">
              <Icon icon={MapPin} size="lg" tone="faint" className="mx-auto" />
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
            <Stagger className="space-y-4" delayBase={120} step={40}>
              {posts.map((post, index) => {
                const cover = post.cover || post.images?.[0]
                return (
                  <Link
                    key={post.slug}
                    href={travelDetailHref(post.slug)}
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
                          <Icon icon={MapPin} size="lg" tone="faint" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(26,16,9,0.62),rgba(26,16,9,0)_65%)]" />
                      {post.localOnly && (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                          <Icon icon={CloudOff} size="sm" />
                          待同步
                        </span>
                      )}
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
                        <Icon icon={Calendar} size="sm" tone="accent" />
                        {formatDate(post.date)}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-[var(--m-accent-strong)]">
                        阅读游记
                        <Icon icon={ArrowRight} size="sm" />
                      </span>
                    </div>
                  </Link>
                )
              })}
            </Stagger>
          )}
        </section>

        <footer className="px-5 pb-3 pt-10 text-center text-xs text-[var(--m-faint)]">
          行迹 · 用足迹丈量中国
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
      <div className="flex min-h-screen flex-col bg-[var(--m-bg)] pt-[max(48px,env(safe-area-inset-top))] text-[var(--m-text)]">
        <EmptyState
          icon={MapPin}
          title="旅行记录加载失败"
          description={message}
          action={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="m-press m-chip m-chip-active !h-11 !px-6 !text-sm"
            >
              重新加载
            </button>
          }
        />
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-[var(--m-bg)] text-[var(--m-text)]">
      <div className="space-y-5 px-5 pb-10 pt-[max(40px,env(safe-area-inset-top))]">
        <div>
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-9 w-44" />
          <SkeletonLines2 />
        </div>
        <div className="m-card overflow-hidden">
          <Skeleton className="m-0 h-[310px] w-full !rounded-none" />
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
