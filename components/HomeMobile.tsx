'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamicImport from 'next/dynamic'
import {
  MapPin,
  ArrowRight,
  CalendarDays,
  Quote,
  Images,
  MessageCircle,
  Sparkles,
  ChartColumn,
  BookOpen,
  PenLine,
  WifiOff,
} from 'lucide-react'
import { travelDetailHref } from '@/lib/routes'
import { apiUrl } from '@/lib/api-base'
import { albumDeepLink } from '@/lib/album-deep-link'
import { findProvinceByLocation } from '@/lib/province-map'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { EmptyState } from '@/components/mobile/EmptyState'
import { Skeleton, SkeletonCard, SkeletonLines } from '@/components/mobile/Skeleton'
import { Stagger } from '@/components/mobile/Stagger'
import { CountUp } from '@/components/mobile/CountUp'
import { Icon } from '@/components/mobile/Icon'
import { IconBadge } from '@/components/mobile/IconBadge'
import { ListSection, ListRow } from '@/components/mobile/ListRow'

/**
 * 首页 Hero 足迹地图：懒加载。
 * lib/geo.ts 静态引入 582KB 的 china-geo.json —— 直接 import 会把这份数据
 * 打进首页首屏包（登录页的 DoorMap 同样用 dynamic 规避）。ssr:false 亦避免
 * SVG path 浮点差异造成的 hydration mismatch。
 */
const HeroFootprintMapLazy = dynamicImport(() => import('@/components/home/HeroFootprintMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse" />,
})

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

interface AnniversaryItem {
  id: number
  title: string
  date: string
  recurring: boolean
  description: string | null
}

interface MomentItem {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
}

/** 画册摘要（/api/travel-book 摘要口径，不含章节明细） */
interface BookSummaryMeta {
  bookKey: string
  title: string
  location: string | null
  startDate: string | null
  coverThumb: string | null
  dayCount: number
  photoCount: number
}

const DAILY_QUOTES = [
  '世界那么大，我想去看看',
  '人生不是一场赛跑，而是一次旅行',
  '生活不止眼前的苟且，还有诗和远方',
  '愿你我既能朝九晚五，也能浪迹天涯',
  '旅行的意义不在于目的地，而在于沿途的风景',
  '愿我们都能成为自己的太阳',
  '星光不问赶路人，时光不负有心人',
  '保持热爱，奔赴山海',
]

function dailyQuote(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0).getTime()
  const day = Math.floor((now.getTime() - start) / 86400000)
  return DAILY_QUOTES[day % DAILY_QUOTES.length]
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了，还在回味旅途吗？'
  if (hour < 12) return '早上好，今天也要出发吗？'
  if (hour < 18) return '下午好，抬头看看窗外的云'
  return '晚上好，翻开今天的旅行记忆'
}

function daysUntil(date: string, recurring: boolean): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date)
  if (!recurring) {
    const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    return Math.max(0, Math.round((t.getTime() - today.getTime()) / 86400000))
  }
  const next = new Date(now.getFullYear(), target.getMonth(), target.getDate())
  if (next.getTime() < today.getTime()) next.setFullYear(next.getFullYear() + 1)
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

function formatAnniversaryDate(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
}

function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return mins + ' 分钟前'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + ' 小时前'
  const days = Math.floor(hours / 24)
  if (days < 30) return days + ' 天前'
  const d = new Date(value)
  return d.toLocaleDateString('zh-CN')
}

/** 首页画册横滑：摘要接口取前 6 本，点开进 /album 阅读（M3-1：给最重要的内容一个首页入口） */
function MobileBooks() {
  const [books, setBooks] = useState<BookSummaryMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(apiUrl('/api/travel-book'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.books)) setBooks(json.books.slice(0, 6))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || books.length === 0) return null

  return (
    <section className="px-4 pb-10">
      <div className="m-section-title">
        <span className="flex items-center gap-2">
          <Icon icon={BookOpen} size="md" tone="accent" />
          旅行画册
        </span>
        <Link href="/album" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--m-accent-strong)]">
          全部画册
          <Icon icon={ArrowRight} size="sm" />
        </Link>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {books.map((book) => (
          <Link
            key={book.bookKey}
            href={albumDeepLink(book.bookKey)}
            className="m-press m-card w-[46vw] max-w-[190px] flex-shrink-0 snap-start overflow-hidden"
            aria-label={`打开《${book.title}》旅行画册`}
          >
            <div className="relative aspect-[4/3] w-full">
              {book.coverThumb ? (
                <Image src={book.coverThumb} alt={book.title} fill sizes="46vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,var(--m-bg-soft),var(--m-surface-2))]">
                  <Icon icon={BookOpen} size="lg" tone="faint" />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="m-body line-clamp-1 font-semibold text-[var(--m-text)]">{book.title}</p>
              <p className="m-caption mt-0.5 text-[var(--m-muted)]">
                {book.dayCount} 章 · {book.photoCount} 图
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function MobileMoments() {
  const [items, setItems] = useState<MomentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(apiUrl('/api/moments?page=1&pageSize=3'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.data?.data) setItems(json.data.data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="m-enter px-4 pb-10">
      <div className="m-section-title">
        <span className="flex items-center gap-2">
          <Icon icon={Sparkles} size="md" tone="accent" />
          碎碎念
        </span>
        <Link href="/moments" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--m-accent-strong)]">
          全部
          <Icon icon={ArrowRight} size="sm" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="m-card animate-pulse p-4">
              <div className="h-3 w-full rounded-full bg-[var(--m-line)]" />
              <div className="mt-2 h-3 w-3/5 rounded-full bg-[var(--m-line)]" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="m-card px-4 py-8 text-center">
          <Icon icon={Sparkles} size="lg" tone="faint" className="mx-auto" />
          <p className="mt-2 text-sm text-[var(--m-muted)]">还没有碎碎念，来写下此刻心情吧</p>
          <Link href="/admin/moments" className="m-chip m-chip-active mt-4 !h-10 !px-5 !text-sm">
            写一条碎碎念
          </Link>
        </div>
      ) : (
        <Stagger className="space-y-3" delayBase={120}>
          {items.map((moment) => (
            <Link key={moment.id} href="/moments" className="m-press m-card block p-4">
              <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--m-text)]">{moment.content}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--m-muted)]">
                <span>{timeAgo(moment.createdAt)}</span>
                {moment.tags && moment.tags.length > 0 && (
                  <span className="m-chip">{moment.tags[0]}</span>
                )}
              </div>
            </Link>
          ))}
        </Stagger>
      )}
    </section>
  )
}

export default function HomeMobile({
  travelPosts,
  provincesVisitedCount,
  anniversaries = [],
  onRefresh = async () => {},
}: {
  travelPosts: PostMeta[]
  provincesVisitedCount: number
  anniversaries?: AnniversaryItem[]
  onRefresh?: () => Promise<unknown> | void
}) {
  const quote = dailyQuote()
  const recent = travelPosts.slice(0, 6)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--m-text)]">

      <PullToRefresh onRefresh={onRefresh}>
        <div className="relative z-10">
          {/* Hero：以「足迹地图」为唯一视觉最重元素 —— 新用户不看文案也能明白这是什么 App。
              原营销大标题下移（并入每日一言），装饰光斑与独立统计卡删除（统计并入地图卡）。 */}
          <section className="m-gutter m-safe-top relative overflow-hidden pb-6">
            <div className="m-enter relative">
              <p className="m-caption font-semibold text-[var(--m-accent-strong)]">{greeting()}</p>
              <p className="m-label mt-3 text-[var(--m-accent-strong)]">TRAVEL DIARY · 行迹</p>
              <h1 className="m-title-1 mt-2 text-[var(--m-text)]">我的旅行足迹</h1>

              {/* 足迹地图：唯一视觉主体。懒加载 —— lib/geo 静态引入 582KB china-geo.json，
                  直接 import 会让首页包体暴涨（登录页同样用 dynamic 规避）。 */}
              <Link
                href="/travel"
                className="m-press m-card mt-5 block overflow-hidden"
                aria-label={`打开旅行地图，已点亮 ${provincesVisitedCount} 个省份`}
              >
                <div className="relative h-[200px] bg-[linear-gradient(165deg,var(--m-bg-soft),var(--m-surface-2))]">
                  <HeroFootprintMapLazy posts={travelPosts} />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-[linear-gradient(to_top,var(--m-surface-solid)_55%,transparent)] px-4 pb-3 pt-10">
                    <span className="m-caption text-[var(--m-muted)]">
                      已点亮
                      <b className="mx-1 text-[15px] font-bold tabular-nums text-[var(--m-accent-strong)]">
                        <CountUp value={provincesVisitedCount} />
                      </b>
                      省 ·
                      <b className="mx-1 text-[15px] font-bold tabular-nums text-[var(--m-accent-strong)]">
                        <CountUp value={travelPosts.length} />
                      </b>
                      篇旅行
                    </span>
                    <span className="m-caption flex flex-none items-center gap-1 font-semibold text-[var(--m-accent-strong)]">
                      看地图
                      <Icon icon={ArrowRight} size="sm" />
                    </span>
                  </div>
                </div>
              </Link>

              <div className="mt-4 flex gap-3">
                <Link
                  href="/travel/new"
                  className="m-press m-body inline-flex h-12 items-center gap-2 rounded-full bg-[var(--m-accent)] px-5 font-semibold text-white"
                >
                  <Icon icon={PenLine} size="sm" />
                  记录一次旅行
                </Link>
                <Link
                  href="/album"
                  className="m-press m-body inline-flex h-12 items-center gap-2 rounded-full border border-[var(--m-line-strong)] bg-[var(--m-surface)] px-5 font-semibold text-[var(--m-text)]"
                >
                  <Icon icon={Images} size="sm" tone="accent" />
                  旅行画册
                </Link>
              </div>
            </div>
          </section>

        {/* 每日一言（保留）：品牌语 + 每日一句。原 Hero 大标题下移到这里，
            既保留品牌表达，又不与足迹地图争首屏焦点。 */}
        <section className="m-gutter pb-8">
          <div className="m-enter m-card relative overflow-hidden p-5 text-center">
            <div className="relative">
              <IconBadge icon={Quote} tone="accent" shape="circle" className="mx-auto" />
              <p className="m-caption mt-4 font-semibold text-[var(--m-accent-strong)]">
                把走过的路，变成自己的故事
              </p>
              <p className="m-title-2 mt-2">「{quote}」</p>
              <p className="m-label mt-3 text-[var(--m-muted)]">DAILY WORDS</p>
            </div>
          </div>
        </section>

        {/* 旅行画册：横滑入口（最近旅行之前） */}
          <MobileBooks />

        {/* 最近旅行：大卡片横向滑动，不是 Web 缩小版列表 */}
        <section className="px-4 pb-10">
          <div className="m-section-title">
            <span className="flex items-center gap-2">
              <Icon icon={MapPin} size="md" tone="accent" />
              最近旅行
            </span>
            <Link href="/travel" className="inline-flex items-center gap-1 py-2 pl-2 -my-2 text-xs font-medium text-[var(--m-accent-strong)]">
              查看全部
              <Icon icon={ArrowRight} size="sm" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <Link href="/travel" className="m-press m-card flex items-center justify-between p-5">
              <div>
                <p className="m-body font-semibold">还没有旅行记录</p>
                <p className="mt-1 text-sm text-[var(--m-muted)]">去旅行地图看看</p>
              </div>
              <Icon icon={ArrowRight} size="md" tone="accent" />
            </Link>
          ) : (
            <Stagger
              className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              delayBase={80}
            >
              {recent.map((post) => (
                <Link
                  key={post.slug}
                  href={travelDetailHref(post.slug)}
                  className="m-press m-card relative h-[230px] w-[82vw] max-w-[320px] flex-shrink-0 snap-start overflow-hidden"
                >
                  {post.cover ? (
                    <Image
                      src={post.cover}
                      alt={post.title}
                      fill
                      sizes="82vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,var(--m-bg-soft),var(--m-surface-2))]">
                      <Icon icon={MapPin} size="lg" tone="faint" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(24,15,9,0.72),rgba(24,15,9,0)_62%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    {post.location && (
                      <span className="m-chip !border-white/20 !bg-white/18 !text-white">
                        {post.location}
                      </span>
                    )}
                    <h3 className="m-title-2 mt-2 line-clamp-1">{post.title}</h3>
                    <p className="mt-1 text-xs text-white/72">
                      {new Date(post.date).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </Link>
              ))}
            </Stagger>
          )}
        </section>

          <MobileMoments />

          {/* 重要日子：色彩卡片 */}
          {anniversaries.length > 0 && (
          <section className="px-4 pb-10">
            <div className="m-section-title">
              <span className="flex items-center gap-2">
                <Icon icon={CalendarDays} size="md" tone="accent" />
                重要日子
              </span>
            </div>
            <Stagger className="grid grid-cols-2 gap-3" delayBase={120}>
              {anniversaries.map((item, i) => {
                const days = daysUntil(item.date, item.recurring)
                // 用统一暖色 token + 左侧强调竖条，替代原先 3 套硬编码渐变
                const tones = ['accent', 'sun', 'blush'] as const
                const tone = tones[i % tones.length]
                return (
                  <div
                    key={item.id}
                    className="m-enter m-press m-card relative overflow-hidden p-4 pl-5"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-3 left-0 w-[3px] rounded-full"
                      style={{ background: `var(--m-tone-${tone}-fg)` }}
                    />
                    <p className="m-caption font-medium text-[var(--m-accent-strong)]">
                      {item.recurring ? '周年纪念' : '纪念日'} · {formatAnniversaryDate(item.date)}
                    </p>
                    <p className="m-body mt-2 line-clamp-1 font-semibold text-[var(--m-text)]">{item.title}</p>
                    <div className="mt-3 flex items-end gap-1">
                      <span className="m-stat text-[var(--m-accent-strong)]">{days}</span>
                      <span className="m-caption pb-1 text-[var(--m-muted)]">天</span>
                    </div>
                    <p className="m-caption mt-1 text-[var(--m-muted)]">{days === 0 ? '就是今天' : '距离这个日子还有'}</p>
                  </div>
                )
              })}
            </Stagger>
          </section>
          )}

          {/* 功能入口：统一 ListRow 结构（暖色 IconBadge + 一致字号），
              替代原先三处硬编码彩色方块（bg-[#F7E6D9] / #E7F1F5 / #EAF0E9） */}
          <ListSection title="更多玩法" className="pb-4">
            <ListRow
              icon={CalendarDays}
              tone="accent"
              title="时间线"
              description="按年份回顾每一段旅程"
              href="/timeline"
            />
            <ListRow
              icon={MessageCircle}
              tone="sun"
              title="碎碎念"
              description="写下此刻想说的话"
              href="/moments"
            />
            <ListRow
              icon={ChartColumn}
              tone="clay"
              title="数据看板"
              description="足迹与照片的全部沉淀"
              href="/dashboard"
            />
          </ListSection>
        </div>
      </PullToRefresh>
    </div>
  )
}

/** 首页移动端加载骨架（替代 AsyncState 整页转圈，防 CLS 抖动） */
export function HomeMobileLoading() {
  return (
    <div className="min-h-screen bg-[var(--m-bg)] text-[var(--m-text)]">
      <div className="space-y-6 px-5 pb-10 pt-[max(40px,env(safe-area-inset-top))]">
        <div>
          <Skeleton className="h-3.5 w-28" />
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-9 w-1/2" />
          </div>
          <SkeletonLines lines={2} className="mt-5 w-4/5" />
          <div className="mt-7 flex gap-3">
            <Skeleton className="h-12 w-40 !rounded-full" />
            <Skeleton className="h-12 w-28 !rounded-full" />
          </div>
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

/** 首页移动端错误态（带重试） */
export function HomeMobileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--m-bg)] pt-[max(48px,env(safe-area-inset-top))] text-[var(--m-text)]">
      <EmptyState
        icon={WifiOff}
        title="首页加载失败"
        description={message}
        action={
          <button
            type="button"
            onClick={onRetry}
            className="m-press m-chip m-chip-active !h-11 !px-6 !text-sm"
          >
            重新加载
          </button>
        }
      />
    </div>
  )
}
