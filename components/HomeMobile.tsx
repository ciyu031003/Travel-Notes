'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  MapPin,
  ArrowRight,
  CalendarDays,
  Quote,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Sparkles,
  BarChart3,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { travelDetailHref } from '@/lib/routes'
import { apiUrl } from '@/lib/api-base'

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
          <BookOpen className="h-[18px] w-[18px] text-[var(--m-accent)]" />
          旅行画册
        </span>
        <Link href="/album" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--m-accent-strong)]">
          全部画册
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {books.map((book) => (
          <Link
            key={book.bookKey}
            href="/album"
            className="m-press m-card w-[46vw] max-w-[190px] flex-shrink-0 snap-start overflow-hidden"
          >
            <div className="relative aspect-[4/3] w-full">
              {book.coverThumb ? (
                <Image src={book.coverThumb} alt={book.title} fill sizes="46vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,var(--m-bg-soft),var(--m-surface-2))]">
                  <BookOpen className="h-8 w-8 text-[var(--m-faint)]" />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="line-clamp-1 text-[14px] font-semibold text-[var(--m-text)]">{book.title}</p>
              <p className="mt-0.5 text-[11px] text-[var(--m-muted)]">
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
          <Sparkles className="h-[18px] w-[18px] text-[var(--m-accent)]" />
          碎碎念
        </span>
        <Link href="/moments" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--m-accent-strong)]">
          全部
          <ArrowRight className="h-3.5 w-3.5" />
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
          <Sparkles className="mx-auto h-6 w-6 text-[var(--m-faint)]" />
          <p className="mt-2 text-sm text-[var(--m-muted)]">还没有碎碎念，来写下此刻心情吧</p>
          <Link href="/admin/moments" className="m-chip m-chip-active mt-4 !h-10 !px-5 !text-sm">
            写一条碎碎念
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
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
        </div>
      )}
    </section>
  )
}

export default function HomeMobile({
  travelPosts,
  provincesVisitedCount,
  anniversaries = [],
}: {
  travelPosts: PostMeta[]
  provincesVisitedCount: number
  anniversaries?: AnniversaryItem[]
}) {
  const quote = dailyQuote()
  const recent = travelPosts.slice(0, 6)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--m-text)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(231,174,113,0.22),transparent_70%)]" />

      <div className="relative z-10">
        {/* M3 移动 Hero：色彩更丰富，信息更聚焦 */}
        <section className="relative overflow-hidden px-5 pb-7 pt-[max(30px,env(safe-area-inset-top))]">
          <div className="pointer-events-none absolute -right-16 top-8 h-44 w-44 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(255,222,184,0.8),rgba(198,122,78,0.05)_68%)] blur-sm" />
          <div className="pointer-events-none absolute -left-10 bottom-2 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(156,199,178,0.35),transparent_70%)]" />

          <div className="m-enter relative">
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[var(--m-accent-strong)]">TRAVEL DIARY · 行迹</p>
            <h1 className="mt-3 text-[40px] font-bold leading-[1.08] tracking-[-0.04em] text-[var(--m-text)]">
              走过的
              <span className="block mt-1">
                地方
                <span className="ml-2 inline-block h-[22px] w-[76px] rounded-full bg-[linear-gradient(90deg,rgba(228,180,120,0.5),rgba(168,95,58,0.18))]" />
              </span>
            </h1>
            <p className="mt-4 max-w-[290px] text-[15px] leading-7 text-[var(--m-muted)]">
              用文字记录生活，用照片定格瞬间，收藏每一段旅行记忆。
            </p>

            <div className="mt-6 flex gap-3">
              <Link
                href="/travel"
                className="m-press inline-flex h-12 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#D58A58,#A85F3A)] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(168,95,58,0.55)]"
              >
                <MapPin className="h-5 w-5" />
                打开旅行地图
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/album"
                className="m-press inline-flex h-12 items-center gap-2 rounded-full border border-[var(--m-line-strong)] bg-[var(--m-surface)] px-5 text-sm font-semibold text-[var(--m-text)]"
              >
                <ImageIcon className="h-5 w-5 text-[var(--m-accent)]" />
                旅行画册
              </Link>
            </div>

            <div className="m-card mt-5 grid grid-cols-2 gap-x-4 gap-y-3 p-4">
              {/* 统计卡可点击：省份/旅程 → 旅行地图（M3-2 动线） */}
              <Link href="/travel" className="m-press rounded-lg">
                <div className="flex items-end gap-1.5">
                  <span className="text-3xl font-bold tracking-tight text-[var(--m-accent-strong)]">{provincesVisitedCount}</span>
                  <span className="pb-1 text-xs text-[var(--m-muted)]">个省份</span>
                </div>
                <p className="mt-1 text-xs text-[var(--m-muted)]">已点亮足迹</p>
              </Link>
              <Link href="/travel" className="m-press rounded-lg">
                <div className="flex items-end gap-1.5">
                  <span className="text-3xl font-bold tracking-tight text-[var(--m-accent-strong)]">{travelPosts.length}</span>
                  <span className="pb-1 text-xs text-[var(--m-muted)]">篇旅行</span>
                </div>
                <p className="mt-1 text-xs text-[var(--m-muted)]">收藏沿途记忆</p>
              </Link>
            </div>
          </div>
        </section>

        {/* 每日一言：作为首页焦点，紧跟 hero，位于“最近旅行”上方 */}
        <section className="px-4 pb-8">
          <div className="m-enter m-card relative overflow-hidden p-5 text-center">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(228,180,120,0.22),transparent_70%)]" />
            <div className="relative">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
                <Quote className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[17px] font-semibold leading-8 tracking-tight">「{quote}」</p>
              <p className="mt-3 text-xs tracking-[0.24em] text-[var(--m-muted)]">DAILY WORDS</p>
            </div>
          </div>
        </section>

        {/* 旅行画册：横滑入口（最近旅行之前） */}
        <MobileBooks />

        {/* 最近旅行：大卡片横向滑动，不是 Web 缩小版列表 */}
        <section className="px-4 pb-10">
          <div className="m-section-title">
            <span className="flex items-center gap-2">
              <MapPin className="h-[18px] w-[18px] text-[var(--m-accent)]" />
              最近旅行
            </span>
            <Link href="/travel" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--m-accent-strong)]">
              查看全部
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <Link href="/travel" className="m-press m-card flex items-center justify-between p-5">
              <div>
                <p className="text-[15px] font-semibold">还没有旅行记录</p>
                <p className="mt-1 text-sm text-[var(--m-muted)]">去旅行地图看看</p>
              </div>
              <ArrowRight className="h-5 w-5 text-[var(--m-accent)]" />
            </Link>
          ) : (
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                      <MapPin className="h-9 w-9 text-[var(--m-faint)]" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(24,15,9,0.72),rgba(24,15,9,0)_62%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    {post.location && (
                      <span className="m-chip !border-white/20 !bg-white/18 !text-white">
                        {post.location}
                      </span>
                    )}
                    <h3 className="mt-2 line-clamp-1 text-[18px] font-bold tracking-tight">{post.title}</h3>
                    <p className="mt-1 text-xs text-white/72">
                      {new Date(post.date).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <MobileMoments />

        {/* 重要日子：色彩卡片 */}
        {anniversaries.length > 0 && (
          <section className="px-4 pb-10">
            <div className="m-section-title">
              <span className="flex items-center gap-2">
                <CalendarDays className="h-[18px] w-[18px] text-[var(--m-accent)]" />
                重要日子
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {anniversaries.map((item, i) => {
                const days = daysUntil(item.date, item.recurring)
                const palettes = [
                  'linear-gradient(135deg,#FFF1E2,#F8CFB0)',
                  'linear-gradient(135deg,#E9F3F6,#BFD8E1)',
                  'linear-gradient(135deg,#EEF6ED,#C9E2C8)',
                ]
                return (
                  <div
                    key={item.id}
                    className="m-enter m-press rounded-[22px] p-4"
                    style={{ background: palettes[i % palettes.length] }}
                  >
                    <p className="text-[11px] font-medium text-[var(--m-accent-strong)]">
                      {item.recurring ? '周年纪念' : '纪念日'} · {formatAnniversaryDate(item.date)}
                    </p>
                    <p className="mt-2 line-clamp-1 text-[15px] font-semibold text-[var(--m-text)]">{item.title}</p>
                    <div className="mt-3 flex items-end gap-1">
                      <span className="text-[34px] font-bold leading-none tracking-tight text-[var(--m-accent-strong)]">{days}</span>
                      <span className="pb-1 text-xs text-[var(--m-muted)]">天</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--m-muted)]">{days === 0 ? '就是今天' : '距离这个日子还有'}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 功能入口：移动端扁平列表，减少层级 */}
        <section className="px-4 pb-4">
          <div className="m-section-title">
            <span className="flex items-center gap-2">
              <Heart className="h-[18px] w-[18px] text-[var(--m-accent)]" />
              更多玩法
            </span>
          </div>
          <div className="space-y-3">
            <Link href="/timeline" className="m-list-item m-press m-card flex items-center gap-4 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F7E6D9] text-[var(--m-accent-strong)]">
                <CalendarDays className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">时间线</span>
                <span className="mt-0.5 block text-xs text-[var(--m-muted)]">按年份回顾每一段旅程</span>
              </span>
              <ArrowRight className="h-5 w-5 text-[var(--m-faint)]" />
            </Link>
            <Link href="/moments" className="m-list-item m-press m-card flex items-center gap-4 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E7F1F5] text-[#6C8EA6]">
                <MessageCircle className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">碎碎念</span>
                <span className="mt-0.5 block text-xs text-[var(--m-muted)]">写下此刻想说的话</span>
              </span>
              <ArrowRight className="h-5 w-5 text-[var(--m-faint)]" />
            </Link>
            <Link href="/dashboard" className="m-list-item m-press m-card flex items-center gap-4 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF0E9] text-[#6E9070]">
                <BarChart3 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">数据看板</span>
                <span className="mt-0.5 block text-xs text-[var(--m-muted)]">足迹与照片的全部沉淀</span>
              </span>
              <ArrowRight className="h-5 w-5 text-[var(--m-faint)]" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
