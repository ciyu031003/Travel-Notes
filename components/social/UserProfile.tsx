'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, UserPlus, UserMinus, Ban } from 'lucide-react'
import TravelFilmCard from '@/components/album/TravelFilmCard'
import { cn } from '@/lib/utils'

interface Profile {
  id: number
  username: string
  createdAt: string | null
  stats: { postCount: number; followerCount: number; followingCount: number }
  isFollowing: boolean
  isBlocked: boolean
  posts: any[]
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-bold text-album-text1">{value}</div>
      <div className="text-xs text-album-text3">{label}</div>
    </div>
  )
}

export default function UserProfile({ userId }: { userId: number }) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/social/users/' + userId)
      .then((r) => r.json())
      .then((json) => { if (json.data) setProfile(json.data); else setError(json.error || '用户不存在') })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false))
  }, [userId])

  const follow = async () => {
    if (!profile || busy) return
    const next = !profile.isFollowing
    const snapshot = profile
    setBusy(true)
    setProfile({ ...profile, isFollowing: next, stats: { ...profile.stats, followerCount: profile.stats.followerCount + (next ? 1 : -1) } })
    try {
      const res = await fetch('/api/social/users/' + userId + '/follow', { method: next ? 'POST' : 'DELETE' })
      if (!res.ok) throw new Error()
    } catch { setProfile(snapshot) } finally { setBusy(false) }
  }

  const toggleBlock = async () => {
    if (!profile || busy) return
    const next = !profile.isBlocked
    const snapshot = profile
    setBusy(true)
    setProfile({ ...profile, isBlocked: next })
    try {
      const res = await fetch('/api/social/users/' + userId + '/block', { method: next ? 'POST' : 'DELETE' })
      if (!res.ok) throw new Error()
    } catch { setProfile(snapshot) } finally { setBusy(false) }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-album-bg0 text-album-text3"><Loader2 className="h-7 w-7 animate-spin" /></div>
  if (error || !profile) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-album-bg0 text-album-text3">{error || '用户不存在'}<Link href="/circle" className="text-album-accent">返回旅行圈</Link></div>

  const cardProps = (p: any) => ({
    coverUrl: p.coverUrl || undefined,
    cityName: p.location || undefined,
    title: p.title,
    dateRange: p.startDate ? p.startDate.slice(0, 10) : '',
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    location: p.location || undefined,
    stats: { likes: p.likeCount, comments: p.commentCount, bookmarks: p.favoriteCount },
    onOpen: () => router.push('/circle/' + p.id),
  })

  return (
    <div className="min-h-screen bg-album-bg0 pb-24">
      <div className="mx-auto max-w-4xl px-4">
        <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-white/10 bg-album-bg0/90 px-4 py-3 backdrop-blur">
          <button type="button" onClick={() => router.back()} className="rounded-full p-1.5 text-album-text2 hover:bg-white/10 hover:text-album-text1"><ArrowLeft className="h-5 w-5" /></button>
          <span className="text-sm text-album-text2">用户主页</span>
        </header>

        <div className="flex flex-col items-center py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-album-accent/20 text-xl font-bold text-album-accent">
            {profile.username.slice(0, 1).toUpperCase()}
          </div>
          <h1 className="mt-3 text-xl font-bold text-album-text1">{profile.username}</h1>
          <div className="mt-4 flex gap-8">
            <Stat label="公开旅行" value={profile.stats.postCount} />
            <Stat label="粉丝" value={profile.stats.followerCount} />
            <Stat label="关注" value={profile.stats.followingCount} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={follow} disabled={busy}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition active:scale-95 disabled:opacity-50',
                profile.isFollowing ? 'bg-white/10 text-album-text1' : 'bg-album-accent text-album-bg0')}>
              {profile.isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {profile.isFollowing ? '取消关注' : '关注'}
            </button>
            <button type="button" onClick={toggleBlock} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-album-text2 transition active:scale-95 hover:text-album-error disabled:opacity-50">
              <Ban className="h-4 w-4" />
              {profile.isBlocked ? '取消屏蔽' : '屏蔽'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.posts.map((p) => <TravelFilmCard key={p.id} {...cardProps(p)} />)}
        </div>
        {profile.posts.length === 0 && <p className="py-16 text-center text-sm text-album-text3">暂无公开旅行</p>}
      </div>
    </div>
  )
}
