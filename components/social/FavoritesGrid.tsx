'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import SocialFilmCard from '@/components/social/SocialFilmCard'

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
    stats: { likes: p.likeCount, comments: p.commentCount, bookmarks: p.favoriteCount },
    frame,
    onOpen: () => router.push('/circle/' + p.id),
  })

  return (
    <div className="min-h-screen bg-night-bg pb-28 text-night-text">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <header className="mb-8 flex items-center gap-3">
          <Link href="/me" className="rounded-full p-2 text-night-muted ring-1 ring-night-line transition hover:text-night-text"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-night-gold/85">Memories</p>
            <h1 className="text-xl font-semibold">我的收藏</h1>
          </div>
        </header>
        {loading ? (
          <div className="py-20 text-center text-night-faint"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : posts.length === 0 ? (
          <p className="py-20 text-center text-sm text-night-faint">还没有收藏任何旅行。</p>
        ) : (
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
            {posts.map((p, i) => <SocialFilmCard key={p.id} {...cardProps(p, FRAMES[i % FRAMES.length])} className="mb-5 break-inside-avoid" />)}
          </div>
        )}
      </div>
    </div>
  )
}
