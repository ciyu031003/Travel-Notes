'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { circlePostHref } from '@/lib/routes'

const FRAMES = ['portrait', 'landscape', 'square', 'wide', 'portrait', 'landscape'] as const

export default function FavoritesGrid() {
  const router = useRouter()
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/social/me/favorites?page=1&pageSize=30').then((r) => r.json()).then((j) => setPosts(j.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cardProps = (p: any, frame: (typeof FRAMES)[number]) => ({
    coverUrl: p.coverUrl || undefined,
    cityName: p.location || undefined,
    title: p.title,
    summary: p.summary,
    dateRange: p.startDate ? p.startDate.slice(0, 10) : '',
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    author: p.author ? { name: p.author.nickname || p.author.username, avatar: p.author.avatarUrl } : null,
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
    <div className="min-h-screen bg-[var(--social-bg)] pb-28 text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <header className="mb-8 flex items-center gap-3">
          <div className="ml-auto"><SocialThemeToggle /></div>
          <Link href="/me" className="rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><Icon icon={ArrowLeft} size="md" /></Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--social-accent)]">Memories</p>
            <h1 className="text-xl font-semibold">我的收藏</h1>
          </div>
        </header>
        {loading ? (
          <div className="py-20 text-center text-[var(--social-faint)]"><Icon icon={Loader2} size="md" className="mx-auto animate-spin" /></div>
        ) : posts.length === 0 ? (
          <p className="py-20 text-center text-sm text-[var(--social-faint)]">还没有收藏任何旅行。</p>
        ) : (
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
            {posts.map((p, i) => <SocialFilmCard key={p.id} {...cardProps(p, FRAMES[i % FRAMES.length])} className="mb-5 break-inside-avoid" />)}
          </div>
        )}
      </div>
    </div>
  )
}
