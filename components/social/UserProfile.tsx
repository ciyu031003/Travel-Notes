'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, UserPlus, UserMinus, Ban } from 'lucide-react'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import { cn } from '@/lib/utils'

interface Profile {
  id: number
  username: string
  nickname: string | null
  avatarUrl: string | null
  accountId: string | null
  createdAt: string | null
  stats: { postCount: number; followerCount: number; followingCount: number }
  isFollowing: boolean
  isBlocked: boolean
  posts: any[]
}

const FRAMES = ['portrait', 'landscape', 'square', 'wide', 'portrait', 'landscape'] as const

function displayName(p: Profile): string {
  return p.nickname || p.username
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-semibold text-night-text tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-night-faint">{label}</div>
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

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-night-bg text-night-faint"><Loader2 className="h-7 w-7 animate-spin" /></div>
  if (error || !profile) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-night-bg text-night-faint">{error || '用户不存在'}<Link href="/circle" className="text-night-gold">返回旅行圈</Link></div>

  const cardProps = (p: any, frame: (typeof FRAMES)[number]) => ({
    coverUrl: p.coverUrl || undefined,
    cityName: p.location || undefined,
    title: p.title,
    summary: p.summary,
    dateRange: p.startDate ? p.startDate.slice(0, 10) : '',
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    location: p.location || undefined,
    author: { name: displayName(profile), avatar: profile.avatarUrl },
    stats: { likes: p.likeCount, comments: p.commentCount, bookmarks: p.favoriteCount },
    frame,
    onOpen: () => router.push('/circle/' + p.id),
  })

  return (
    <div className="min-h-screen bg-night-bg pb-24 text-night-text">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <header className="mb-8 flex items-center gap-3">
          <button type="button" onClick={() => router.back()} className="rounded-full p-2 text-night-muted ring-1 ring-night-line transition hover:text-night-text"><ArrowLeft className="h-5 w-5" /></button>
          <span className="text-sm text-night-muted">旅行者主页</span>
        </header>

        <section className="flex flex-col gap-8 sm:flex-row sm:items-center">
          <SocialAvatar name={displayName(profile)} avatarUrl={profile.avatarUrl} size={96} className="text-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-night-text">{displayName(profile)}</h1>
            <p className="mt-1 text-sm text-night-muted">@{profile.username}</p>
            {profile.accountId && <span className="mt-2 inline-block rounded-full bg-night-goldSoft px-3 py-1 text-xs text-night-gold">ID {profile.accountId}</span>}
            <div className="mt-6 flex gap-10">
              <Stat label="Trips" value={profile.stats.postCount} />
              <Stat label="Followers" value={profile.stats.followerCount} />
              <Stat label="Following" value={profile.stats.followingCount} />
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={follow} disabled={busy}
                className={cn('inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-medium transition active:scale-95 disabled:opacity-50',
                  profile.isFollowing ? 'bg-night-surface text-night-muted ring-1 ring-night-line' : 'bg-night-gold text-[#1a120a]')}>
                {profile.isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {profile.isFollowing ? '取消关注' : '关注'}
              </button>
              <button type="button" onClick={toggleBlock} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-night-surface px-6 py-2.5 text-sm text-night-muted ring-1 ring-night-line transition hover:text-night-text disabled:opacity-50">
                <Ban className="h-4 w-4" />{profile.isBlocked ? '取消屏蔽' : '屏蔽'}
              </button>
            </div>
          </div>
        </section>

        <div className="mt-12 flex items-center gap-3">
          <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-night-gold/80">Travel Stories</h2>
          <div className="h-px flex-1 bg-night-line" />
        </div>

        {profile.posts.length > 0 ? (
          <div className="mt-6 columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
            {profile.posts.map((p, i) => <SocialFilmCard key={p.id} {...cardProps(p, FRAMES[i % FRAMES.length])} className="mb-5 break-inside-avoid" />)}
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-night-faint">还没有公开的旅行故事。</p>
        )}
      </div>
    </div>
  )
}
