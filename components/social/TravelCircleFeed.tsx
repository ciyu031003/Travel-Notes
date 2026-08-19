'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Compass } from 'lucide-react'
import TravelFilmCard from '@/components/album/TravelFilmCard'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'recommended', label: '推荐' },
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热门' },
  { key: 'following', label: '关注' },
]

interface PostAuthor { id: number; username: string }
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

  const load = useCallback(async (t: string, p: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/social/posts?tab=' + t + '&page=' + p + '&pageSize=12')
      if (res.ok) {
        const json = await res.json()
        const data = json.data || []
        setPosts((prev) => (append ? [...prev, ...data] : data))
        setTotal(json.total || 0)
        setHasMore(json.hasMore || false)
        setPage(p)
      } else {
        setError('加载失败')
      }
    } catch { setError('网络错误') } finally {
      if (append) setLoadingMore(false); else setLoading(false)
    }
  }, [])

  useEffect(() => { load('recommended', 1, false) }, [load])

  const switchTab = (t: string) => { setTab(t); load(t, 1, false) }
  const loadMore = () => { if (hasMore && !loadingMore) load(tab, page + 1, true) }

  const [hero, ...rest] = posts

  const cardProps = (p: Post) => ({
    coverUrl: p.coverUrl || undefined,
    cityName: p.location || undefined,
    title: p.title,
    dateRange: dateRange(p),
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    location: p.location || undefined,
    author: p.author ? { name: p.author.username } : undefined,
    stats: { likes: p.likeCount, comments: p.commentCount, bookmarks: p.favoriteCount },
    onOpen: () => router.push('/circle/' + p.id),
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold text-album-text1">
          <Compass className="h-5 w-5 text-album-accent" /> 旅行圈
        </h1>
        <p className="mt-1 text-xs text-album-text3">看看别人眼中的世界 · {total} 篇公开旅行</p>
      </header>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => switchTab(t.key)}
            className={cn('shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors',
              tab === t.key ? 'bg-album-accent font-medium text-album-bg0' : 'bg-white/5 text-album-text2 hover:bg-white/10 hover:text-album-text1')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-24 text-album-text3">
          <Loader2 className="h-7 w-7 animate-spin" />
          <span className="text-sm">正在翻阅旅行相册…</span>
        </div>
      ) : error ? (
        <div className="py-20 text-center text-sm text-album-error">{error}</div>
      ) : posts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 py-24 text-center">
          <p className="text-sm text-album-text3">这里还很安静，去公开一段旅行吧</p>
          <button type="button" onClick={() => router.push('/travel')} className="mt-4 rounded-full bg-album-accent/15 px-5 py-2 text-sm text-album-accent hover:bg-album-accent/25">去我的旅行</button>
        </div>
      ) : (
        <>
          {hero && (
            <div className="mb-5">
              <TravelFilmCard {...cardProps(hero)} variant="hero" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => <TravelFilmCard key={p.id} {...cardProps(p)} />)}
          </div>
          <div className="mt-8 flex justify-center">
            {hasMore ? (
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="rounded-full bg-white/5 px-6 py-2.5 text-sm text-album-text2 hover:bg-white/10 hover:text-album-text1 disabled:opacity-50">
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            ) : (
              rest.length > 0 && <span className="text-xs text-album-text3">已经到底啦</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
