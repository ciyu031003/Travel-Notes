'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import dynamicImport from 'next/dynamic'
import {
  MapPin,
  ArrowRight,
  CalendarDays,
  Images,
  Sparkles,
  BookOpen,
  PenLine,
  Menu,
  Search,
  Wallet,
  Camera,
  Plus,
  Plane,
  CheckCircle2,
  Moon,
  Sun,
} from 'lucide-react'
import { travelDetailHref } from '@/lib/routes'
import { apiUrl } from '@/lib/api-base'
import { albumDeepLink } from '@/lib/album-deep-link'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { Skeleton } from '@/components/mobile/Skeleton'
import { Icon } from '@/components/mobile/Icon'
import { toast } from '@/lib/mobile/toast-store'
import type { HomeBookSummary, HomeMoment } from '@/lib/home/types'
import TicketReveal from '@/components/mobile/ticket/TicketReveal'
import TicketFace from '@/components/mobile/ticket/TicketFace'
import ExpenseDeck from '@/components/mobile/expense/ExpenseDeck'
import { deriveTicket } from '@/lib/ticket/derive'
import { readTicketOverride } from '@/lib/ticket/store'
import type { TicketData } from '@/lib/ticket/types'
import { buildExpenseDeck } from '@/lib/expense-card/derive'
import type { ExpenseDeckData } from '@/lib/expense-card/types'
import { totalPhotoCount } from '@/lib/home/photo-count'
import { runAfterFirstPaint } from '@/lib/client/persisted-cache'

/**
 * 首页 Hero 足迹地图：懒加载。
 * lib/geo.ts 静态引入 582KB 的 china-geo.json —— 直接 import 会把这份数据
 * 打进首页首屏包（登录页的 DoorMap 同样用 dynamic 规避）。ssr:false 亦避免
 * SVG path 浮点差异造成的 hydration mismatch。
 */
const HeroFootprintMapLazy = dynamicImport(() => import('@/components/home/HeroFootprintMap'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
})

/**
 * 功能菜单抽屉懒加载（P1-19）：它依赖 motion/react。首页自 P1-18 起走服务端渲染，
 * 静态引用会把 motion 拉回首屏脚本；改为 dynamic 后只在点开菜单时下载。
 *
 * E1 追加（2026-11-21 · 首屏 JS 瘦身）：之前虽然用了 dynamic，但组件**一挂载就渲染**，
 * dynamic 会在首屏内容刚出来的同一刻去拉 motion chunk（实测 121KB raw / 40KB gz，
 * 与首屏内容、图片抢同一条带宽）。现在改成「首次点开菜单才挂载」，并在首帧之后的空闲里
 * **预取** chunk —— 既不进首屏关键路径，用户真的点开时模块也已经就绪。
 */
const HomeMobileDrawer = dynamicImport(() => loadDrawerModule(), {
  ssr: false,
})

/** 抽屉模块的共享加载入口：dynamic 的首屏加载、空闲预取、按下预取都复用它（模块只求值一次） */
function loadDrawerModule() {
  return import('@/components/home/HomeMobileDrawer')
}

interface PostMeta {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  tags?: string[]
  location?: string
  /** 同行者（AA 分摊参与人）；/api/travels 下发，账单卡片用它算人均 */
  companions?: unknown
  localOnly?: boolean
}

interface AnniversaryItem {
  id: number
  title: string
  date: string
  recurring: boolean
  description: string | null
}

export interface DraftTravel {
  id: number
  slug: string
  title: string
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  cover: string | null
  createdAt: string | null
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
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好呀'
  if (hour < 18) return '下午好呀'
  return '晚上好呀'
}

function todayText(): string {
  const d = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
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

/** 首页画册：横向 3 列书封预览 */
function MobileBooks({ books }: { books: HomeBookSummary[] }) {
  const visibleBooks = books.slice(0, 3)
  if (visibleBooks.length === 0) return null

  return (
    <section>
      <div className="m2-section-head">
        <h2 className="m2-section-title">旅行画册</h2>
        <Link href="/album" className="m2-section-link">
          全部画册
          <Icon icon={ArrowRight} size="sm" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {visibleBooks.map((book) => (
          <Link
            key={book.bookKey}
            href={albumDeepLink(book.bookKey)}
            className="m-press text-left"
            aria-label={`打开《${book.title}》旅行画册`}
          >
            <div className="m2-book-cover">
              {book.coverThumb ? (
                <Image src={book.coverThumb} alt={book.title} fill sizes="30vw" className="object-cover"  onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Icon icon={BookOpen} size="lg" tone="faint" />
                </div>
              )}
            </div>
            <p className="mt-2 line-clamp-1 text-[11px] font-semibold text-[var(--m-text)]">{book.title}</p>
            <p className="mt-0.5 text-[11px] text-[var(--m-faint)]">{book.photoCount} 张照片</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** 最近碎碎念：最多两条，保持首页的“内容呼吸口” */
function MobileMoments({ moments }: { moments: HomeMoment[] }) {
  return (
    <section>
      <div className="m2-section-head">
        <h2 className="m2-section-title">最近碎碎念</h2>
        <Link href="/moments" className="m2-section-link">
          查看全部
          <Icon icon={ArrowRight} size="sm" />
        </Link>
      </div>

      {moments.length === 0 ? (
        <Link href="/moments" className="m2-card m-press flex items-center gap-3 p-4">
          <span className="m2-icon-box m2-tone-pink">
            <Icon icon={Sparkles} size="md" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">还没有碎碎念</span>
            <span className="mt-0.5 block truncate text-[12px] text-[var(--m-muted)]">来写下此刻的心情吧</span>
          </span>
          <Icon icon={ArrowRight} size="sm" tone="faint" />
        </Link>
      ) : (
        <div className="space-y-2">
          {moments.slice(0, 2).map((m) => (
            <Link key={m.id} href="/moments" className="m2-card m-press block p-4">
              <p className="line-clamp-2 text-[13px] leading-6 text-[var(--m-text)]">{m.content}</p>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[var(--m-faint)]">
                <span>{new Date(m.createdAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span>
                {m.tags?.[0] && (
                  <>
                    <span>·</span>
                    <span>{m.tags[0]}</span>
                  </>
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
  // 这里用 router 只做"票据揭晓 → 查看旅程 / 票据夹"的跳转（与底部导航同一套路由）

  travelPosts,
  draftTravels = [],
  provincesVisitedCount,
  anniversaries = [],
  books = [],
  recentMoments = [],
  onRefresh = async () => {},
}: {
  travelPosts: PostMeta[]
  draftTravels?: DraftTravel[]
  provincesVisitedCount: number
  anniversaries?: AnniversaryItem[]
  books?: HomeBookSummary[]
  recentMoments?: HomeMoment[]
  onRefresh?: () => Promise<unknown> | void
}) {
  const router = useRouter()
  const quote = dailyQuote()
  const recent = travelPosts.slice(0, 6)
  const totalPhotos = totalPhotoCount(travelPosts)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  /** 抽屉是否已经挂载过（首次点开才挂载 → motion chunk 不进首屏） */
  const [drawerMounted, setDrawerMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [dailyStamp, setDailyStamp] = useState('')

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    const d = new Date()
    setDailyStamp((d.getMonth() + 1) + '/' + String(d.getDate()).padStart(2, '0'))
  }, [])

  /**
   * 首帧之后（空闲）预取抽屉 chunk。
   * 抽屉要等用户点「功能菜单」才挂载，但也不能让用户点下去才发现要下载 ——
   * 这里在首屏内容稳定之后（rAF 之后 2.5s）悄悄把模块取回来，点开时是「已就绪」状态。
   */
  useEffect(() => {
    // 2.5s：这时首屏内容早已上屏、图片也基本解码完，占用一点带宽不影响「内容出现」；
    // 用户真去点菜单时模块已就绪（点击前的 pointerdown 还会再兜一次预取）。
    return runAfterFirstPaint(() => {
      void loadDrawerModule().catch(() => {})
    }, { delayMs: 2500 })
  }, [])

  /** 手指按下/悬停就预取：从按下到抬手通常 80~150ms，足够把模块取回 */
  const warmDrawer = () => {
    void loadDrawerModule().catch(() => {})
  }

  const toggleTheme = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
    setIsDark(next)
  }
  const active = draftTravels[0] ?? null
  const restDrafts = draftTravels.slice(1)
  /** 完成归档后弹出的票据（旋转揭晓 + 烟花彩带） */
  const [revealTicket, setRevealTicket] = useState<TicketData | null>(null)
  /** 票据关掉后接着弹的「账单费用卡片」牌堆（本次旅途每一笔花销一张卡） */
  const [expenseDeck, setExpenseDeck] = useState<ExpenseDeckData | null>(null)
  /** 刚归档的那段旅程：票据关闭后要拿它的 id 去拉账本 */
  const archivedTravelRef = useRef<{ id: number; slug: string; title: string } | null>(null)

  /** 「完成并归档」：写入 confirmedAt → 该旅行进入最近旅行与画册，首页大入口消失 */
  const confirmDraft = async (id: number) => {
    setConfirmingId(id)
    try {
      const res = await fetch(apiUrl(`/api/travels/${id}/confirm`), { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('confirm failed')
      toast.success('已归档，已加入旅行画册与最近旅行')
      /**
       * 完成一次旅程 = 生成一张纪念票（需求：屏幕中间旋转弹出 + 烟花彩带）。
       * 票面数据全部由这段旅程派生（lib/ticket/derive），乘客名取当前用户昵称；
       * 用户在票面上改过的字段（localStorage）优先，保证与票据夹里一致。
       */
      const item = draftTravels.find((t) => t.id === id)
      if (item) {
        let passenger = '旅行者'
        try {
          const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' })
          if (meRes.ok) {
            const me = await meRes.json()
            const profile = me?.data ?? me
            passenger = profile?.nickname || profile?.username || passenger
          }
        } catch {
          /* 昵称拿不到就用默认乘客名，不影响出票 */
        }
        archivedTravelRef.current = { id: item.id, slug: item.slug, title: item.title }
        setRevealTicket(
          deriveTicket({
            travel: {
              id: item.id,
              slug: item.slug,
              title: item.title,
              location: item.location,
              startDate: item.startDate,
              endDate: item.endDate,
            },
            passenger,
            override: readTicketOverride(item.id),
          }),
        )
        /**
         * 注意：这里**不立即 onRefresh()**。
         * 首页的刷新是「先骨架再落数据」：一刷新 HomeMobile 会被卸载，刚弹出的票据跟着消失。
         * 正确顺序：先让用户看完票据（旋转+彩带），关闭时再刷新首页（此时该旅程已进「最近旅行」）。
         */
        return
      }
      await onRefresh()
    } catch {
      toast.error('归档失败，请重试')
    } finally {
      setConfirmingId(null)
    }
  }

  /**
   * 票据关掉后接着弹账单卡片：拉这次旅途的账本 → 一笔花销一张卡。
   * 没有记账（或全部金额为 0）就什么都不弹，不打扰用户。
   */
  const openExpenseDeck = useCallback(async (): Promise<boolean> => {
    const archived = archivedTravelRef.current
    if (!archived) return false
    archivedTravelRef.current = null
    try {
      /**
       * 两路并行：账本 + 旅行列表（列表里带 companions）。
       * 首页的 draftTravels 是"进行中"的摘要，没有同行者名单；归档后这段旅程会出现在
       * /api/travels 里，按 slug 匹配就能拿到 AA 的真实参与人。
       * 列表拿不到（离线/慢网）时退回「付款人 ∪ 我」，卡片照常出。
       */
      const [expenseRes, travelsRes] = await Promise.all([
        fetch(apiUrl('/api/travels/' + archived.id + '/expenses'), { credentials: 'include' }),
        fetch(apiUrl('/api/travels'), { credentials: 'include' }).catch(() => null),
      ])
      if (!expenseRes.ok) return false
      const json = await expenseRes.json()
      let companions: { name?: string | null }[] = []
      try {
        const travelsJson = travelsRes && travelsRes.ok ? await travelsRes.json() : null
        const post = (travelsJson?.posts || []).find(
          (p: { slug?: string; id?: number }) => p?.slug === archived.slug || p?.id === 1_000_000 + archived.id,
        )
        if (post && Array.isArray(post.companions)) companions = post.companions
      } catch {
        /* 同行者拿不到就退化为付款人，不影响出票 */
      }
      const deck = buildExpenseDeck({
        travelId: archived.id,
        travelTitle: archived.title,
        expenses: json?.expenses || [],
        companions,
      })
      if (!deck) return false
      setExpenseDeck(deck)
      return true
    } catch {
      /* 账本拉取失败不影响归档结果，静默跳过 */
      return false
    }
  }, [])

  /** 快捷入口：全部复用现有能力；没有进行中旅程时统一落到“新建旅程” */
  const quickHref = (hash: string) => (active ? `${travelDetailHref(active.slug)}${hash}` : '/travel/new')
  const quickActions = [
    { icon: PenLine, label: '记一笔', href: quickHref(''), tone: 'm2-tone-pink' },
    { icon: Camera, label: '传照片', href: quickHref('#album'), tone: 'm2-tone-peach' },
    { icon: Wallet, label: '记花费', href: quickHref('#expense'), tone: 'm2-tone-mint' },
    { icon: Plane, label: '新旅程', href: '/travel/new', tone: 'm2-tone-sky' },
  ]

  return (
    <div className="relative m-mobile-page m-bottom-nav-safe m2-screen text-[var(--m-text)]">
      <PullToRefresh onRefresh={onRefresh}>
        <div className="relative z-10">
          {/* ── V6 品牌顶栏 + 编辑式导语 + 搜索 / 夜色 / 菜单 ── */}
          <header className="m2-gutter m-safe-top pb-2">
            <div className="v6-appbar">
              <Link href="/" className="v6-brand" aria-label="甜途 · 旅行记忆空间">
                <span className="v6-logo" aria-hidden="true">甜</span>
                <span className="v6-brand-text"><b>甜途</b><small>旅行记忆空间</small></span>
              </Link>
              <div className="v6-actions">
                <Link href="/search" aria-label="搜索旅行、城市与回忆" className="v6-icon">
                  <Icon icon={Search} size="md" />
                </Link>
                <button type="button" onClick={toggleTheme} aria-label={isDark ? '切换到暖色主题' : '切换到夜色主题'} className="v6-icon">
                  <Icon icon={isDark ? Sun : Moon} size="md" />
                </button>
                <button
                  type="button"
                  aria-label="打开功能菜单"
                  onClick={() => {
                    setDrawerMounted(true)
                    setDrawerOpen(true)
                  }}
                  onPointerDown={warmDrawer}
                  onPointerEnter={warmDrawer}
                  className="v6-icon"
                >
                  <Icon icon={Menu} size="md" />
                </button>
              </div>
            </div>

            <div className="v6-intro">
              <p className="m2-eyebrow">{greeting()} · {todayText()} · 旅行手帖</p>
              <h1 className="v6-display">把走过的路，<br />收藏成回忆。</h1>
              <p className="m2-page-sub">每一段路途都值得被认真记录。<br />今天，也为下一次出发留一点期待。</p>
            </div>
          </header>

          <main className="m2-gutter space-y-6 pb-8">
            {/* ── 进行中的旅行：Hero 大卡 + 其余旅程紧凑卡 ── */}
            {active && (
              <section>
                <article className="m2-hero-card">
                  <div className="m2-hero-img h-[286px]">
                    {active.cover ? (
                      <Image src={active.cover} alt={active.title} fill sizes="100vw" className="object-cover" priority  onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[linear-gradient(140deg,var(--m-bg-soft),var(--m-surface-2))]">
                        <Icon icon={MapPin} size="lg" tone="faint" />
                      </div>
                    )}
                    <div className="m2-hero-shade" />

                    <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                      <span className="m2-pill m2-pill-honey">
                        <Icon icon={Sparkles} size="sm" />
                        进行中 · {active.dayCount} 天
                      </span>
                      <Link
                        href={travelDetailHref(active.slug)}
                        aria-label={`打开《${active.title}》`}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-[rgba(58,20,36,0.48)] text-white backdrop-blur-md"
                      >
                        <Icon icon={ArrowRight} size="md" />
                      </Link>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <p className="text-[11px] text-white/90">
                        {active.location || '还没填目的地'} · 已有 {active.photoCount} 张照片
                      </p>
                      <h2 className="mt-1 line-clamp-1 text-[26px] font-bold leading-tight">{active.title}</h2>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Link
                          href={travelDetailHref(active.slug)}
                          className="m-press inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] bg-white text-[14px] font-semibold text-[var(--m-tone-accent-fg)]"
                        >
                          <Icon icon={PenLine} size="sm" />
                          继续记录
                        </Link>
                        <button
                          type="button"
                          onClick={() => void confirmDraft(active.id)}
                          disabled={confirmingId === active.id}
                          className="m-press inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] border border-white/35 bg-white/15 text-[14px] font-semibold text-white backdrop-blur-md disabled:opacity-60"
                        >
                          <Icon icon={CheckCircle2} size="sm" />
                          {confirmingId === active.id ? '归档中…' : '完成归档'}
                        </button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Link
                          href={travelDetailHref(active.slug) + '#album'}
                          className="m2-pill m2-pill-dark-glass min-h-[36px] px-3"
                        >
                          <Icon icon={Images} size="sm" />
                          添加照片
                        </Link>
                        <Link
                          href={travelDetailHref(active.slug) + '#itinerary'}
                          className="m2-pill m2-pill-dark-glass min-h-[36px] px-3"
                        >
                          <Icon icon={CalendarDays} size="sm" />
                          安排行程
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>

                {restDrafts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {restDrafts.map((d) => (
                      <article key={d.id} className="m2-card overflow-hidden">
                        <Link href={travelDetailHref(d.slug)} className="m2-trip-row">
                          <span className="m2-trip-thumb">
                            {d.cover ? (
                              <Image src={d.cover} alt={d.title} fill sizes="96px" className="object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            ) : (
                              <span className="flex h-full items-center justify-center text-[var(--m-faint)]">
                                <Icon icon={Images} size="md" />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1 py-1">
                            <span className="m2-pill m2-pill-honey">进行中</span>
                            <span className="mt-2 block truncate text-[16px] font-bold">{d.title}</span>
                            <span className="mt-1 block text-[11px] text-[var(--m-faint)]">
                              {d.location || '还没填目的地'} · {d.dayCount} 天 · {d.photoCount} 张照片
                            </span>
                            <span className="mt-2 block text-[11px] font-semibold text-[var(--m-accent-strong)]">
                              继续记录 <Icon icon={ArrowRight} size="sm" className="inline align-[-2px]" />
                            </span>
                          </span>
                        </Link>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── 四宫格快捷入口：记录动作集中在拇指热区 ── */}
            <section className="grid grid-cols-4 gap-2">
              {quickActions.map((item) => (
                <Link key={item.label} href={item.href} className="m2-quick">
                  <span className={`m2-icon-box ${item.tone}`}>
                    <Icon icon={item.icon} size="md" />
                  </span>
                  <span className="m2-quick-label">{item.label}</span>
                </Link>
              ))}
            </section>

            {/* ── 旅行足迹：统计 + 地图预览 ── */}
            <section className="m2-card overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4">
                <div>
                  <p className="m2-eyebrow">TRAVEL FOOTPRINT</p>
                  <h2 className="m2-section-title mt-1">我的旅行足迹</h2>
                </div>
                <Link href="/travel" className="m2-section-link">
                  <Icon icon={MapPin} size="sm" />
                  查看足迹
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 px-4">
                <div className="text-center">
                  <b className="block text-[22px] leading-none tabular-nums text-[var(--m-accent-strong)]">{provincesVisitedCount}</b>
                  <span className="mt-1 block text-[11px] text-[var(--m-faint)]">点亮省份</span>
                </div>
                <div className="border-x border-[var(--m-line)] text-center">
                  <b className="block text-[22px] leading-none tabular-nums text-[var(--m-tone-sun-fg)]">{travelPosts.length}</b>
                  <span className="mt-1 block text-[11px] text-[var(--m-faint)]">旅行篇数</span>
                </div>
                <div className="text-center">
                  <b className="block text-[22px] leading-none tabular-nums text-[var(--m-tone-mint-fg)]">{totalPhotos}</b>
                  <span className="mt-1 block text-[11px] text-[var(--m-faint)]">照片张数</span>
                </div>
              </div>

              <Link
                href="/travel"
                className="relative mt-4 block h-[176px] overflow-hidden border-t border-[var(--m-line)] bg-[linear-gradient(140deg,#FFE6EE,#FFF8F3_52%,#FFF1CF)] dark:bg-[linear-gradient(140deg,#3A1D28,#241720_52%,#3D2D16)]"
                aria-label={`打开旅行地图，已点亮 ${provincesVisitedCount} 个省份`}
              >
                <HeroFootprintMapLazy posts={travelPosts} countBadges={false} />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[linear-gradient(to_top,var(--m-surface-solid)_55%,transparent)] px-4 pb-3 pt-8">
                  <span className="text-[11px] font-semibold text-[var(--m-muted)]">足迹示意 · {provincesVisitedCount} / 34 省</span>
                  <span className="text-[11px] font-semibold text-[var(--m-accent-strong)]">
                    打开地图 <Icon icon={ArrowRight} size="sm" className="inline align-[-2px]" />
                  </span>
                </span>
              </Link>
            </section>

            {/* ── 每日一言：V6 编辑式卡片 ── */}
            <section className="v6-quote-card" aria-label="每日一言">
              <span className="v6-quote-spark" aria-hidden="true">✦</span>
              <p>「{quote}」</p>
              <span className="v6-quote-stamp">
                <small>DAILY</small>
                <b>{dailyStamp}</b>
              </span>
            </section>

            {/* ── 最近旅行：150px 横滑卡 ── */}
            <section>
              <div className="m2-section-head">
                <h2 className="m2-section-title">最近旅行</h2>
                <Link href="/travel" className="m2-section-link">
                  查看全部
                  <Icon icon={ArrowRight} size="sm" />
                </Link>
              </div>

              {recent.length === 0 ? (
                <Link href="/travel" className="m2-card m-press flex items-center justify-between p-5">
                  <div>
                    <p className="text-[14px] font-semibold">还没有旅行记录</p>
                    <p className="mt-1 text-[12px] text-[var(--m-muted)]">去旅行地图看看，或记录第一次出发</p>
                  </div>
                  <Icon icon={ArrowRight} size="md" tone="accent" />
                </Link>
              ) : (
                <div className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {recent.map((post) => (
                    <Link
                      key={post.slug}
                      href={travelDetailHref(post.slug)}
                      className="w-[150px] flex-none snap-start"
                    >
                      <div className="relative h-[148px] w-full overflow-hidden rounded-[18px] bg-[var(--m-surface-2)]">
                        {post.cover ? (
                          <Image src={post.cover} alt={post.title} fill sizes="150px" className="object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Icon icon={MapPin} size="lg" tone="faint" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(58,20,36,0.72),transparent_60%)]" />
                        <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                          <p className="text-[11px] text-white/85">{post.location || '未填写地点'}</p>
                          <p className="mt-0.5 line-clamp-1 text-[15px] font-bold">{post.title}</p>
                        </div>
                      </div>
                      <p className="mt-1.5 px-1 text-[11px] text-[var(--m-faint)]">{post.date ? post.date.slice(0, 10) : ''}</p>
                    </Link>
                  ))}

                  <Link
                    href="/travel/new"
                    className="flex h-[148px] w-[150px] flex-none flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-[var(--m-line-strong)] text-[var(--m-faint)]"
                  >
                    <Icon icon={Plus} size="md" />
                    <span className="text-[11px] font-semibold">记录新旅程</span>
                  </Link>
                </div>
              )}
            </section>

            <MobileBooks books={books} />
            <MobileMoments moments={recentMoments} />

            {/* ── 重要日子 ── */}
            {anniversaries.length > 0 && (
              <section>
                <div className="m2-section-head">
                  <h2 className="m2-section-title">重要日子</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {anniversaries.map((item, i) => {
                    const days = daysUntil(item.date, item.recurring)
                    const tones = ['m2-tone-pink', 'm2-tone-honey', 'm2-tone-lavender'] as const
                    return (
                      <div key={item.id} className={`m2-card p-4 ${tones[i % tones.length]}`}>
                        <p className="text-[11px] font-semibold opacity-80">
                          {item.recurring ? '周年纪念' : '纪念日'} · {formatAnniversaryDate(item.date)}
                        </p>
                        <p className="mt-2 line-clamp-1 text-[14px] font-semibold">{item.title}</p>
                        <div className="mt-3 flex items-end gap-1">
                          <span className="text-[26px] font-bold leading-none tabular-nums">{days}</span>
                          <span className="pb-0.5 text-[11px] opacity-80">天</span>
                        </div>
                        <p className="mt-1 text-[11px] opacity-75">{days === 0 ? '就是今天' : '距离这个日子还有'}</p>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <footer className="pt-6 text-center text-[11px] text-[var(--m-faint)]">
              甜途 · 把走过的路，变成值得记住的故事
            </footer>
          </main>
        </div>
      </PullToRefresh>

      {/* 首次点开才挂载：motion chunk 不进首屏关键路径（chunk 已在首帧后空闲预取） */}
      {drawerMounted && <HomeMobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}

      {/* 完成归档 → 票据旋转揭晓（烟花/彩带） */}
      {revealTicket && (
        <TicketReveal
          ticket={revealTicket}
          onClose={() => {
            setRevealTicket(null)
            /**
             * 顺序很重要：先弹账单卡片，**刷新首页要等牌堆关掉之后**。
             * 首页刷新是「骨架屏 → 新数据」，HomeMobile 会被卸载 —— 若先刷新，
             * 刚挂上的牌堆会跟着被卸载（表现为"点了关闭就回首页，卡片没出现"）。
             */
            void openExpenseDeck().then((opened) => {
              if (!opened) void onRefresh()
            })
          }}
          onOpenTravel={() => {
            const slug = revealTicket.slug
            setRevealTicket(null)
            router.push(travelDetailHref(slug))
          }}
          onOpenArchive={() => {
            setRevealTicket(null)
            router.push('/tickets')
          }}
        >
          <TicketFace ticket={revealTicket} />
        </TicketReveal>
      )}

      {/* 票据之后：本次旅途的账单卡片牌堆（左右滑动看每一笔 / 刮开看人均） */}
      {expenseDeck && (
        <ExpenseDeck
          deck={expenseDeck}
          onClose={() => {
            setExpenseDeck(null)
            // 牌堆关掉再刷新首页：归档后的旅程进入「最近旅行」，进行中入口消失
            void onRefresh()
          }}
          onOpenTravel={() => {
            const slug = archivedTravelRef.current?.slug
            setExpenseDeck(null)
            if (slug) router.push(travelDetailHref(slug))
          }}
        />
      )}
    </div>
  )
}
