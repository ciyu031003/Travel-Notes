'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Compass, Home, WifiOff } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import { cn } from '@/lib/utils'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { apiUrl } from '@/lib/api-base'
import { circlePostHref } from '@/lib/routes'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalSocialFeed } from '@/lib/modules/offline/social-read'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { SegmentedControl } from '@/components/mobile/SegmentedControl'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { EmptyState } from '@/components/mobile/EmptyState'
import { Skeleton, SkeletonCard } from '@/components/mobile/Skeleton'
import { Stagger } from '@/components/mobile/Stagger'

const TABS = [
  { key: 'recommended', label: '推荐' },
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热门' },
  { key: 'following', label: '关注' },
]

const THEMES = ['海边', '周末旅行', '结伴旅行', '城市漫游', '星空', '摄影']
const FRAMES = ['portrait', 'landscape', 'square', 'wide', 'portrait', 'landscape'] as const

// 旅行关系映射（Travel.travelType 枚举 → 卡片叙事文案）
const TRAVEL_RELATION: Record<string, string> = {
  ALONE: '独旅',
  COUPLE: '与TA',
  FAMILY: '与家人',
  FRIENDS: '与朋友',
  BFF: '与闺蜜',
  GROUP: '结伴',
  OTHER: '结伴',
}

interface PostAuthor { id: number; username: string; nickname?: string | null; avatarUrl?: string | null }
interface Post {
  id: number
  coverUrl: string | null
  title: string
  summary: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  travelType?: string | null
  author: PostAuthor | null
  likeCount: number
  commentCount: number
  favoriteCount: number
}

function dateRange(p: Post): string {
  const s = p.startDate ? p.startDate.slice(0, 10) : ''
  const e = p.endDate ? p.endDate.slice(0, 10) : ''
  if (s && e && s !== e) return s + ' ~ ' + e
  return s || e || ''
}

function displayName(a: PostAuthor | null): string {
  return a ? a.nickname || a.username : '旅行者'
}

function relationLabel(p: Post): string | undefined {
  return p.travelType ? TRAVEL_RELATION[p.travelType] : undefined
}

export default function TravelCircleFeed() {
  const router = useRouter()
  const [tab, setTab] = useState('recommended')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [offline, setOffline] = useState(false)
  const [activeTheme, setActiveTheme] = useState<string | null>(null)
  /** 访客态：只读浏览。`authChecked` 之前不渲染提示，避免登录用户看到一闪而过的横幅 */
  const [loggedIn, setLoggedIn] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setLoggedIn(!!j.authenticated)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setAuthChecked(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async (t: string, p: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true)
    setError('')
    try {
      const result = await readWithFallback<{ data: Post[]; total: number; hasMore: boolean }>(
        async () => {
          const res = await fetch(apiUrl('/api/social/posts?tab=' + t + '&page=' + p + '&pageSize=12'), { credentials: 'include' })
          if (!res.ok) throw new Error('http ' + res.status)
          return (await res.json()) as { data: Post[]; total: number; hasMore: boolean }
        },
        async () => {
          const local = await readLocalSocialFeed()
          if (local == null) return null
          return { data: local as Post[], total: local.length, hasMore: false }
        },
      )
      const json = result.data
      const data = json.data || []
      setPosts((prev) => (append ? [...prev, ...data] : data))
      setTotal(json.total || 0)
      setHasMore(json.hasMore || false)
      setPage(p)
      setOffline(result.source === 'local')
    } catch { setError('网络错误') } finally {
      if (append) setLoadingMore(false); else setLoading(false)
    }
  }, [])

  useEffect(() => { load('recommended', 1, false) }, [load])

  const switchTab = (t: string) => { setTab(t); load(t, 1, false) }
  const loadMore = () => { if (hasMore && !loadingMore) load(tab, page + 1, true) }

  const hero = posts[0]

  const cardProps = (p: Post, frame: (typeof FRAMES)[number] = 'portrait') => ({
    coverUrl: p.coverUrl,
    cityName: p.location || undefined,
    title: p.title,
    summary: p.summary,
    dateRange: dateRange(p),
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    location: p.location || undefined,
    travelRelation: relationLabel(p),
    author: p.author ? { name: displayName(p.author), avatar: p.author.avatarUrl || null } : null,
    stats: { likes: p.likeCount, comments: p.commentCount, bookmarks: p.favoriteCount },
    frame,
    // 统一入口：id 缺失时不跳 `/circle/undefined`（R2 路由加固）
    onOpen: () => {
      const href = circlePostHref(p.id)
      if (href) router.push(href)
    },
  })

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] overflow-hidden bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%),radial-gradient(40%_40%_at_100%_0%,rgba(126,147,173,0.06),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-[max(26px,env(safe-area-inset-top))] sm:px-6 sm:pt-8">
        <PullToRefresh onRefresh={() => load(tab, 1, false)}>
        <header className="m-enter mb-7 hidden items-start justify-between gap-4 md:flex">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--social-accent)]">Travel Circle</p>
            <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-[var(--social-text)]">旅行圈</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--social-muted)]">看看别人眼中的世界，发现正在发生的旅途。</p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <SocialThemeToggle />
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-4 py-2 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] hover:ring-[var(--social-line-strong)]">
              <Icon icon={Home} size="sm" />返回首页
            </Link>
          </div>
        </header>

        {/* 移动端：iOS 大标题 + 分段控制器 */}
        <div className="md:hidden">
          <LargeTitle
            title="旅行圈"
            subtitle="看看别人眼中的世界，发现正在发生的旅途。"
            trailing={<SocialThemeToggle />}
          />
        </div>

        {offline && (
          <div className="mb-6 flex items-center justify-center gap-1.5 rounded-full bg-[var(--social-accent-soft)] px-4 py-1.5 text-xs text-[var(--social-accent)]">
            <Icon icon={WifiOff} size="sm" />
            离线模式：显示已缓存的旅行圈内容
          </div>
        )}

        <div className="mb-4 md:hidden">
          <SegmentedControl
            value={tab}
            options={TABS.map((t) => ({ value: t.key, label: t.label }))}
            onChange={switchTab}
          />
        </div>

        <div className="sticky top-[max(10px,env(safe-area-inset-top))] z-20 mb-4 -mx-4 hidden gap-2 overflow-x-auto px-4 pb-2 pt-1 backdrop-blur-sm md:flex [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => switchTab(t.key)}
              className={cn('shrink-0 rounded-full px-4 py-2 text-sm transition active:scale-95',
                tab === t.key ? 'bg-[var(--social-accent)] text-[var(--social-on-accent)] shadow-[0_8px_18px_-8px_var(--social-accent)]' : 'bg-[var(--social-surface)] text-[var(--social-muted)] ring-1 ring-[var(--social-line)] hover:text-[var(--social-text)]')}>
              {t.label}
            </button>
          ))}
        </div>

        {/*
          UI 精修（R3）：
          · 「探索旅途」原先是独立一段（标题 + 分隔线 + 话题 chips），占掉手机首屏近 1/4，
            而它其实是**次级筛选**。现在收进一条横向滚动条，与分段控制器连成一组筛选区，
            首屏能直接看到第一张卡片。
          · 未选话题时不显示任何 chip 的高亮，避免"看起来已经筛过了"的误导。
        */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {THEMES.map((theme) => {
            const active = activeTheme === theme
            return (
              <button
                key={theme}
                type="button"
                onClick={() => setActiveTheme(active ? null : theme)}
                aria-pressed={active}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition active:scale-95',
                  active
                    ? 'border-[var(--social-accent)] bg-[var(--social-accent)] text-[var(--social-on-accent)]'
                    : 'border-[var(--social-line)] text-[var(--social-muted)] hover:text-[var(--social-text)]',
                )}
              >
                # {theme}
              </button>
            )
          })}
        </div>

        {/* 访客提示：能看，但互动要登录 —— 先说清楚，而不是让用户点了才发现 */}
        {!authChecked ? null : !loggedIn ? (
          <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-[var(--social-accent-soft)] px-4 py-3">
            <Icon icon={Compass} size="sm" className="shrink-0 text-[var(--social-accent)]" />
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--social-accent)]">
              你现在是访客，可以随意翻看公开的旅行。登录后能点赞、评论，也能分享自己的旅途。
            </p>
            <Link
              href="/login?redirect=%2Fcircle"
              className="shrink-0 rounded-full bg-[var(--social-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--social-on-accent)]"
            >
              去登录
            </Link>
          </div>
        ) : null}

        {loading ? (
          <>
            <div className="hidden flex-col items-center gap-3 py-28 text-[var(--social-faint)] md:flex"><Icon icon={Loader2} size="lg" tone="accent" className="animate-spin" /><span className="text-sm">正在翻阅旅行相册…</span></div>
            <div className="space-y-4 md:hidden">
              <Skeleton className="h-72 w-full !rounded-[26px]" />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </>
        ) : error ? (
          <>
            <div className="hidden py-20 text-center text-sm text-[var(--social-muted)] md:block">{error}</div>
            <div className="md:hidden">
              <EmptyState
                icon={WifiOff}
                title="网络开小差了"
                description={error}
                action={
                  <button type="button" onClick={() => load(tab, 1, false)} className="m-press m-chip m-chip-active !h-11 !px-6 !text-sm">重新加载</button>
                }
              />
            </div>
          </>
        ) : posts.length === 0 ? (
          <>
          <div className="relative hidden overflow-hidden rounded-[2rem] bg-[var(--social-surface-60)] px-6 py-28 text-center ring-1 ring-[var(--social-line)] md:block">
            <div className="absolute inset-0 bg-[radial-gradient(40%_50%_at_50%_30%,rgba(232,179,106,0.08),transparent_70%)]" />
            <div className="relative">
              <Icon icon={Compass} size="lg" tone="accent" className="mx-auto" />
              <p className="mt-4 text-base text-[var(--social-text)]">这里还没有故事。</p>
              <p className="mt-2 text-sm text-[var(--social-muted)]">去看看自己的旅途，也许下一段故事就从那里开始。</p>
              <button type="button" onClick={() => router.push('/travel')} className="mt-6 rounded-full bg-[var(--social-accent)] px-6 py-2.5 text-sm font-medium text-[var(--social-on-accent)]">去我的旅行</button>
            </div>
          </div>
          <div className="md:hidden">
            <EmptyState
              icon={Compass}
              title="这里还没有故事"
              description={
                loggedIn
                  ? '把你的旅行公开出来，它就是这里的第一篇。'
                  : '登录后可以翻看大家公开的旅行记录。'
              }
              action={
                <button
                  type="button"
                  onClick={() => router.push(loggedIn ? '/travel' : '/login?redirect=%2Fcircle')}
                  className="m-press m-chip m-chip-active !h-11 !px-6 !text-sm"
                >
                  {loggedIn ? '去我的旅行' : '去登录'}
                </button>
              }
            />
          </div>
          </>
        ) : (
          <>
            {/*
              UI 精修（R3）：加一条「共 N 篇」的段落头 —— 首屏现在能一眼看出
              这是列表而不是一屏孤零零的卡；同时把 hero 与瀑布流之间的间距收紧
              （mb-8 → mb-5），手机上一屏能看到 hero + 半张卡，滚动意图更明确。
            */}
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm font-semibold tracking-wide text-[var(--social-text)]">
                {tab === 'following' ? '关注的旅途' : '最新旅途'}
              </span>
              <span className="h-px flex-1 bg-[var(--social-line)]" />
              {total > 0 && <span className="text-xs tabular-nums text-[var(--social-faint)]">共 {total} 篇</span>}
            </div>

            {/* 移动端：保留紧凑 hero 大图叙事（桌面端走瀑布流，避免全宽巨卡） */}
            {hero && <SocialFilmCard {...cardProps(hero, 'wide')} variant="hero" className="m-enter mb-5 md:hidden" />}
            <Stagger className="m-enter columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]" delayBase={60} step={36}>
              {posts.map((p, i) => (
                <SocialFilmCard
                  key={p.id}
                  {...cardProps(p, FRAMES[i % FRAMES.length])}
                  className={cn('mb-5 break-inside-avoid', hero && p.id === hero.id && 'hidden md:block')}
                />
              ))}
            </Stagger>
            <div className="mt-6 flex justify-center">
              {hasMore ? (
                <button type="button" onClick={loadMore} disabled={loadingMore}
                  className="rounded-full bg-[var(--social-surface)] px-6 py-2.5 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] hover:ring-[var(--social-line-strong)] active:scale-95 disabled:opacity-50">
                  {loadingMore ? '加载中…' : '加载更多'}
                </button>
              ) : (
                posts.length > 0 && (
                  <span className="text-xs text-[var(--social-faint)]">看到这里就是全部了 · 共 {posts.length} 篇</span>
                )
              )}
            </div>
          </>
        )}
        </PullToRefresh>
      </div>
    </div>
  )
}
