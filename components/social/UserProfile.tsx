'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, UserPlus, UserMinus, Ban } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import { cn } from '@/lib/utils'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { apiUrl } from '@/lib/api-base'
import { circlePostCommentsHref, circlePostHref } from '@/lib/routes'
import { goBackOrHome } from '@/lib/navigation'

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
      <div className="text-xl font-semibold text-[var(--ui-social-text)] tabular-nums">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--ui-social-faint)]">{label}</div>
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
    fetch(apiUrl('/api/social/users/' + userId), { credentials: 'include' })
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
      const res = await fetch(apiUrl('/api/social/users/' + userId + '/follow'), { method: next ? 'POST' : 'DELETE', credentials: 'include' })
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
      const res = await fetch(apiUrl('/api/social/users/' + userId + '/block'), { method: next ? 'POST' : 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error()
    } catch { setProfile(snapshot) } finally { setBusy(false) }
  }

  if (loading) return <div className="flex min-h-dvh items-center justify-center bg-[var(--ui-social-bg)] text-[var(--ui-social-faint)]"><Icon icon={Loader2} size="lg" className="animate-spin" /></div>
  if (error || !profile) return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--ui-social-bg)] text-[var(--ui-social-faint)]">{error || '用户不存在'}<Link href="/circle" className="text-[var(--ui-social-accent)]">返回旅行圈</Link></div>

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
    // 快捷点赞：在别人的主页浏览其旅行时也能直接点赞（/circle/user/* 需登录才能进）
    postId: p.id,
    liked: p.isLiked,
    likeCount: p.likeCount,
    // 收藏与评论入口：与旅行圈列表口径一致（`/api/social/users/[id]` 走 attachViewerState，
    // 已回填 isFavorited / favoriteCount；评论数点击直接展开评论抽屉）
    favorited: p.isFavorited,
    favoriteCount: p.favoriteCount,
    onOpenComments: () => {
      const href = circlePostCommentsHref(p.id)
      if (href) router.push(href)
    },
    stats: { comments: p.commentCount, bookmarks: p.favoriteCount },
    frame,
    onOpen: () => {
      const href = circlePostHref(p.id)
      if (href) router.push(href)
    },
  })

  return (
    <div className="min-h-dvh bg-[var(--ui-social-bg)] pb-24 text-[var(--ui-social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <header className="mb-8 flex items-center gap-3">
          <div className="ml-auto"><SocialThemeToggle /></div>
          {/* 图标按钮：补可访问名称 + 44px 触达（pro-rules 两条硬要求） */}
          <button
            type="button"
            onClick={() => goBackOrHome(router)}
            aria-label="返回"
            className="m-pressable flex h-11 w-11 items-center justify-center rounded-full text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] hover:text-[var(--ui-social-text)]"
          >
            <Icon icon={ArrowLeft} size="md" />
          </button>
          <span className="text-sm text-[var(--ui-social-muted)]">旅行者主页</span>
        </header>

        <section className="flex flex-col gap-8 sm:flex-row sm:items-center">
          <SocialAvatar name={displayName(profile)} avatarUrl={profile.avatarUrl} size={96} className="text-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ui-social-text)]">{displayName(profile)}</h1>
            <p className="mt-1 text-sm text-[var(--ui-social-muted)]">@{profile.username}</p>
            {profile.accountId && <span className="mt-2 inline-block rounded-full bg-[var(--ui-social-accent-soft)] px-3 py-1 text-xs text-[var(--ui-social-accent)]">ID {profile.accountId}</span>}
            <div className="mt-6 flex gap-10">
              <Stat label="Trips" value={profile.stats.postCount} />
              <Stat label="Followers" value={profile.stats.followerCount} />
              <Stat label="Following" value={profile.stats.followingCount} />
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={follow} disabled={busy}
                className={cn('inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-medium transition active:scale-95 disabled:opacity-50',
                  profile.isFollowing ? 'bg-[var(--ui-social-surface)] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)]' : 'bg-[var(--ui-social-accent)] text-[var(--ui-social-on-accent)]')}>
                {profile.isFollowing ? <Icon icon={UserMinus} size="sm" /> : <Icon icon={UserPlus} size="sm" />}
                {profile.isFollowing ? '取消关注' : '关注'}
              </button>
              <button type="button" onClick={toggleBlock} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ui-social-surface)] px-6 py-2.5 text-sm text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] transition hover:text-[var(--ui-social-text)] disabled:opacity-50">
                <Icon icon={Ban} size="sm" />{profile.isBlocked ? '取消屏蔽' : '屏蔽'}
              </button>
            </div>
          </div>
        </section>

        <div className="mt-12 flex items-center gap-3">
          <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--ui-social-accent)]">Travel Stories</h2>
          <div className="h-px flex-1 bg-[var(--ui-social-line)]" />
        </div>

        {profile.posts.length > 0 ? (
          <div className="mt-6 columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
            {profile.posts.map((p, i) => <SocialFilmCard key={p.id} {...cardProps(p, FRAMES[i % FRAMES.length])} className="mb-5 break-inside-avoid" />)}
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-[var(--ui-social-faint)]">还没有公开的旅行故事。</p>
        )}
      </div>
    </div>
  )
}
