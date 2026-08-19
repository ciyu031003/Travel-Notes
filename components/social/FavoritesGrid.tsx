'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import TravelFilmCard from '@/components/album/TravelFilmCard'

export default function FavoritesGrid() {
  const router = useRouter()
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/social/me/favorites?page=1&pageSize=30').then((r) => r.json()).then((j) => setPosts(j.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cardProps = (p: any) => ({
    coverUrl: p.coverUrl || undefined,
    cityName: p.location || undefined,
    title: p.title,
    dateRange: p.startDate ? p.startDate.slice(0, 10) : '',
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    location: p.location || undefined,
    author: p.author ? { name: p.author.username } : undefined,
    stats: { likes: p.likeCount, comments: p.commentCount, bookmarks: p.favoriteCount },
    onOpen: () => router.push('/circle/' + p.id),
  })

  return (
    <div className="min-h-screen bg-album-bg0 pb-24">
      <div className="mx-auto max-w-5xl px-4">
        <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-white/10 bg-album-bg0/90 px-4 py-3 backdrop-blur">
          <Link href="/me" className="rounded-full p-1.5 text-album-text2 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-sm font-semibold text-album-text1">我的收藏</h1>
        </header>
        {loading ? (
          <div className="py-20 text-center text-album-text3"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : posts.length === 0 ? (
          <p className="py-20 text-center text-sm text-album-text3">还没有收藏任何旅行</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{posts.map((p) => <TravelFilmCard key={p.id} {...cardProps(p)} />)}</div>
        )}
      </div>
    </div>
  )
}
