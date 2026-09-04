'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Compass, Home, WifiOff } from 'lucide-react'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import { cn } from '@/lib/utils'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalSocialFeed } from '@/lib/modules/offline/social-read'

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
    onOpen: () => router.push('/circle/' + p.id),
  })

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] overflow-hidden bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%),radial-gradient(40%_40%_at_100%_0%,rgba(126,147,173,0.06),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-[max(26px,env(safe-area-inset-top))] sm:px-6 sm:pt-8">
        <header className="m-enter mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--social-accent)]">Travel Circle</p>
            <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-[var(--social-text)]">旅行圈</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--social-muted)]">看看别人眼中的世界，发现正在发生的旅途。</p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <SocialThemeToggle />
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-4 py-2 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] hover:ring-[var(--social-line-strong)]">
              <Home className="h-4 w-4" />返回首页
            </Link>
          </div>
        </header>

        {offline && (
          <div className="mb-6 flex items-center justify-center gap-1.5 rounded-full bg-[var(--social-accent-soft)] px-4 py-1.5 text-xs text-[var(--social-accent)]">
            <WifiOff className="h-3.5 w-3.5" />
            离线模式：显示已缓存的旅行圈内容
          </div>
        )}

        <div className="sticky top-[max(10px,env(safe-area-inset-top))] z-20 mb-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 pt-1 backdrop-blur-sm [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => switchTab(t.key)}
              className={cn('shrink-0 rounded-full px-4 py-2 text-sm transition active:scale-95',
                tab === t.key ? 'bg-[var(--social-accent)] text-[var(--social-on-accent)] shadow-[0_8px_18px_-8px_var(--social-accent)]' : 'bg-[var(--social-surface)] text-[var(--social-muted)] ring-1 ring-[var(--social-line)] hover:text-[var(--social-text)]')}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-8 md:mb-10">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide text-[var(--social-text)]">探索旅途</span>
            <span className="h-px flex-1 bg-[var(--social-line)]" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {THEMES.map((theme) => {
              const active = activeTheme === theme
              return (
                <button key={theme} type="button" onClick={() => setActiveTheme(active ? null : theme)}
                  className={cn('rounded-full px-3 py-1 text-xs transition',
                    active
                      ? 'bg-[var(--social-accent)] text-[var(--social-on-accent)]'
                      : 'text-[var(--social-muted)] hover:bg-[var(--social-accent-soft)] hover:text-[var(--social-accent)]')}>
                  # {theme}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-28 text-[var(--social-faint)]"><Loader2 className="h-7 w-7 animate-spin text-[var(--social-accent)]" /><span className="text-sm">正在翻阅旅行相册…</span></div>
        ) : error ? (
          <div className="py-20 text-center text-sm text-[var(--social-muted)]">{error}</div>
        ) : posts.length === 0 ? (
          <div className="relative overflow-hidden rounded-[2rem] bg-[var(--social-surface-60)] px-6 py-28 text-center ring-1 ring-[var(--social-line)]">
            <div className="absolute inset-0 bg-[radial-gradient(40%_50%_at_50%_30%,rgba(232,179,106,0.08),transparent_70%)]" />
            <div className="relative">
              <Compass className="mx-auto h-10 w-10 text-[var(--social-accent)]" />
              <p className="mt-4 text-base text-[var(--social-text)]">这里还没有故事。</p>
              <p className="mt-2 text-sm text-[var(--social-muted)]">去看看自己的旅途，也许下一段故事就从那里开始。</p>
              <button type="button" onClick={() => router.push('/travel')} className="mt-6 rounded-full bg-[var(--social-accent)] px-6 py-2.5 text-sm font-medium text-[var(--social-on-accent)]">去我的旅行</button>
            </div>
          </div>
        ) : (
          <>
            {/* 移动端：保留紧凑 hero 大图叙事（桌面端走瀑布流，避免全宽巨卡） */}
            {hero && <SocialFilmCard {...cardProps(hero, 'wide')} variant="hero" className="m-enter mb-8 md:hidden" />}
            <div className="m-enter columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
              {posts.map((p, i) => (
                <SocialFilmCard
                  key={p.id}
                  {...cardProps(p, FRAMES[i % FRAMES.length])}
                  className={cn('mb-5 break-inside-avoid', hero && p.id === hero.id && 'hidden md:block')}
                />
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              {hasMore ? (
                <button type="button" onClick={loadMore} disabled={loadingMore}
                  className="rounded-full bg-[var(--social-surface)] px-6 py-2.5 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] hover:ring-[var(--social-line-strong)] disabled:opacity-50">
                  {loadingMore ? '加载中…' : '加载更多'}
                </button>
              ) : (
                posts.length > 0 && <span className="text-xs text-[var(--social-faint)]">已经到底啦</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
