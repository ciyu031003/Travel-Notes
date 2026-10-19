'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { goBackOrHome } from '@/lib/navigation'
import { circlePostHref } from '@/lib/routes'
import { apiUrl } from '@/lib/api-base'

const FRAMES = ['portrait', 'landscape', 'square', 'wide', 'portrait', 'landscape'] as const

type FavoriteRow = {
  id: number
  coverUrl?: string | null
  location?: string | null
  title?: string
  summary?: string
  startDate?: string | null
  dayCount?: number
  photoCount?: number
  author?: { nickname?: string | null; username?: string; avatarUrl?: string | null } | null
  isLiked?: boolean
  likeCount?: number
  commentCount?: number
  favoriteCount?: number
}

export default function FavoritesGrid() {
  const router = useRouter()
  const [posts, setPosts] = useState<FavoriteRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(apiUrl('/api/social/me/favorites?page=1&pageSize=30')).then((r) => r.json()).then((j) => setPosts(j.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cardProps = (p: FavoriteRow, frame: (typeof FRAMES)[number]) => ({
    coverUrl: p.coverUrl || undefined,
    cityName: p.location || undefined,
    title: p.title,
    summary: p.summary,
    dateRange: p.startDate ? p.startDate.slice(0, 10) : '',
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    author: p.author ? { name: p.author.nickname || p.author.username || '', avatar: p.author.avatarUrl ?? null } : null,
    // 快捷点赞：收藏列表里也能直接点赞（/api/social/me/favorites 已回填 isLiked）
    postId: p.id,
    liked: p.isLiked,
    likeCount: p.likeCount,
    stats: { comments: p.commentCount, bookmarks: p.favoriteCount },
    frame,
    onOpen: () => {
      const href = circlePostHref(p.id)
      if (href) router.push(href)
    },
  })

  return (
    <div className="min-h-dvh bg-[var(--ui-social-bg)] pb-28 text-[var(--ui-social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      {/* m-safe-top：/me/* 走「不挂 Navbar」分支，顶部安全区必须由页面自己负责，
          否则标题栏会被手机状态栏压住（与旅行圈详情同类问题）。 */}
      <div className="m-safe-top relative mx-auto max-w-5xl px-4 pb-6">
        <header className="mb-8 flex items-center gap-3">
          {/* 返回键放**左侧**（用户习惯位置），并真正回上一级而非固定 /me */}
          <button
            type="button"
            onClick={() => goBackOrHome(router, '/me')}
            aria-label="返回上一级"
            className="m-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] transition-colors hover:text-[var(--ui-social-text)]"
          >
            <Icon icon={ArrowLeft} size="md" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--ui-social-accent)]">Memories</p>
            <h1 className="text-xl font-semibold">我的收藏</h1>
          </div>
          <SocialThemeToggle />
        </header>
        {loading ? (
          <div className="py-20 text-center text-[var(--ui-social-muted)]"><Icon icon={Loader2} size="md" className="mx-auto animate-spin" /></div>
        ) : posts.length === 0 ? (
          <p className="py-20 text-center text-sm text-[var(--ui-social-muted)]">还没有收藏任何旅行。</p>
        ) : (
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
            {posts.map((p, i) => <SocialFilmCard key={p.id} {...cardProps(p, FRAMES[i % FRAMES.length])} className="mb-5 break-inside-avoid" />)}
          </div>
        )}
      </div>
    </div>
  )
}
