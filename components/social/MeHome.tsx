'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Home, LogOut, Camera, Pencil, X, Loader2, MapPin, Images, Compass, NotebookPen, Bookmark, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'

interface MeProfile {
  id: number
  username: string
  nickname: string | null
  avatarUrl: string | null
  accountId: string | null
  createdAt: string | null
  stats: {
    tripCount: number
    placeCount: number
    photoCount: number
    dayCount: number
    momentCount: number
    favoriteCount: number
    postCount: number
    followerCount: number
    followingCount: number
  }
  recentTravel: { id: number; title: string; slug: string; location: string | null; startDate: string | null; endDate: string | null; coverUrl: string | null } | null
  dashboard: { travelCount: number; totalPhotos: number; momentCount: number; totalLikes: number; provincesVisitedCount: number } | null
}

const FRAMES = ['portrait', 'landscape', 'square', 'wide', 'portrait', 'landscape'] as const

function dateRange(start?: string | null, end?: string | null): string {
  const s = start ? start.slice(0, 10) : ''
  const e = end ? end.slice(0, 10) : ''
  if (s && e && s !== e) return s + ' — ' + e
  return s || e || ''
}

export default function MeHome({ initial }: { initial: MeProfile }) {
  const router = useRouter()
  const [profile, setProfile] = useState<MeProfile>(initial)
  const [posts, setPosts] = useState<any[]>([])
  const [unread, setUnread] = useState(0)
  const [showEdit, setShowEdit] = useState(false)
  const [nickname, setNickname] = useState(initial.nickname || '')
  const [savingNick, setSavingNick] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const displayName = profile.nickname || profile.username

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((j) => { if (j.data) { setProfile(j.data); setNickname(j.data.nickname || '') } }).catch(() => {})
    fetch('/api/social/users/' + initial.id).then((r) => r.json()).then((j) => setPosts(j.data?.posts || [])).catch(() => {})
    fetch('/api/social/notifications?page=1&pageSize=1').then((r) => r.json()).then((j) => { if (j.data?.unread != null) setUnread(j.data.unread) }).catch(() => {})
  }, [initial.id])

  const saveNickname = async () => {
    setSavingNick(true); setError('')
    try {
      const res = await fetch('/api/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) })
      const json = await res.json()
      if (res.ok && json.data) {
        setProfile((p) => ({ ...p, nickname: json.data.nickname }))
        setShowEdit(false)
      } else {
        setError(json.error || '保存失败')
      }
    } catch { setError('网络错误') } finally { setSavingNick(false) }
  }

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res = await fetch('/api/me/avatar', { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok && json.data) setProfile((p) => ({ ...p, avatarUrl: json.data.avatarUrl }))
      else setError(json.error || '头像上传失败')
    } catch { setError('网络错误') } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const logout = async () => {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    router.push('/login')
  }

  const cardProps = (p: any, frame: (typeof FRAMES)[number]) => ({
    coverUrl: p.coverUrl || undefined,
    cityName: p.location || undefined,
    title: p.title,
    summary: p.summary,
    dateRange: p.startDate ? p.startDate.slice(0, 10) : '',
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    author: { name: displayName, avatar: profile.avatarUrl },
    stats: { likes: p.likeCount, comments: p.commentCount, bookmarks: p.favoriteCount },
    frame,
    onOpen: () => router.push('/circle/' + p.id),
  })

  const memories = [
    { icon: Images, label: '相册', value: profile.stats.photoCount, suffix: '张照片', href: '/album' },
    { icon: MapPin, label: '旅行', value: profile.stats.tripCount, suffix: '次旅途', href: '/travel' },
    { icon: NotebookPen, label: '碎碎念', value: profile.stats.momentCount, suffix: '条记录', href: '/moments' },
    { icon: Bookmark, label: '收藏', value: profile.stats.favoriteCount, suffix: '个记忆', href: '/me/favorites' },
  ]

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-28 text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%),radial-gradient(40%_40%_at_100%_0%,rgba(126,147,173,0.05),transparent_60%)]" />
      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--social-accent)]">My Archive</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">我的旅行档案</h1>
          </div>
          <div className="flex items-center gap-2">
            <SocialThemeToggle />
            <Link href="/me/notifications" className="relative rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><span className="text-base">✦</span>{unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--social-accent)]" />}</Link>
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-4 py-2 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><Home className="h-4 w-4" />返回首页</Link>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.1fr_1.4fr]">
          <div>
            <div className="flex items-end gap-5">
              <div className="relative">
                <SocialAvatar name={displayName} avatarUrl={profile.avatarUrl} size={92} className="text-3xl" />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--social-accent)] text-[var(--social-on-accent)] ring-2 ring-[var(--social-bg)] transition hover:bg-[var(--social-accent-strong)] disabled:opacity-60">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
              </div>
              <button type="button" onClick={() => { setNickname(profile.nickname || ''); setError(''); setShowEdit(true) }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-3 py-1.5 text-xs text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]">
                <Pencil className="h-3.5 w-3.5" />编辑昵称
              </button>
            </div>

            <h2 className="mt-5 text-3xl font-semibold tracking-tight">{displayName}</h2>
            <p className="mt-1 text-sm text-[var(--social-muted)]">@{profile.username}</p>
            {profile.accountId && <span className="mt-3 inline-block rounded-full bg-[var(--social-accent-soft)] px-3 py-1 text-xs text-[var(--social-accent)]">ID {profile.accountId}</span>}
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-[var(--social-muted)]">把走过的路，变成值得记住的故事。</p>
          </div>

          <div className="lg:pt-4">
            {profile.recentTravel ? (
              <Link href={'/travel/' + encodeURIComponent(profile.recentTravel.slug)} className="group relative block overflow-hidden rounded-[2rem] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]">
                <div className="relative aspect-[16/10]">
                  {profile.recentTravel.coverUrl ? (
                    <img src={profile.recentTravel.coverUrl} alt={profile.recentTravel.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--social-surface2)] text-[var(--social-faint)]"><MapPin className="h-8 w-8" /></div>
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-[#050505]/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--social-accent)]">最近的一次旅行</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">{profile.recentTravel.title}</h3>
                  <p className="mt-2 text-sm text-[var(--social-muted)]">{profile.recentTravel.location || ''}{profile.recentTravel.location ? ' · ' : ''}{dateRange(profile.recentTravel.startDate, profile.recentTravel.endDate)}</p>
                </div>
              </Link>
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center rounded-[2rem] bg-[var(--social-surface-60)] text-[var(--social-faint)] ring-1 ring-[var(--social-line)]">还没有旅行记录</div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
              {[
                ['Trips', profile.stats.tripCount, '次旅行'],
                ['Places', profile.stats.placeCount, '个地点'],
                ['Photos', profile.stats.photoCount, '张照片'],
                ['Days', profile.stats.dayCount, '天旅途'],
              ].map(([label, value, suffix]) => (
                <div key={String(label)}>
                  <div className="text-3xl font-semibold tracking-tight text-[var(--social-text)] tabular-nums">{value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--social-accent)]">{label}</div>
                  <div className="mt-1 text-xs text-[var(--social-faint)]">{suffix}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {profile.dashboard && (
          <section className="mt-10">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">数据汇总</h2>
              <div className="h-px flex-1 bg-[var(--social-line)]" />
              <Link href="/dashboard" className="text-xs text-[var(--social-faint)] transition hover:text-[var(--social-accent)]">数据看板 →</Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-5">
              {[
                ['省份', profile.dashboard.provincesVisitedCount],
                ['旅行记录', profile.dashboard.travelCount],
                ['旅行照片', profile.dashboard.totalPhotos],
                ['碎碎念', profile.dashboard.momentCount],
                ['收到点赞', profile.dashboard.totalLikes],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--social-accent)]">{label}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-14">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">我的记忆</h2>
            <div className="h-px flex-1 bg-[var(--social-line)]" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {memories.map((m, i) => (
              <Link key={m.label} href={m.href}
                className={cn('group relative overflow-hidden rounded-[1.4rem] bg-[var(--social-surface-80)] p-5 ring-1 ring-[var(--social-line)] transition hover:bg-[var(--social-surface)] hover:ring-[var(--social-line-strong)]', i === 0 && 'bg-[var(--social-accent-soft)]')}>
                <m.icon className="h-5 w-5 text-[var(--social-accent)]" />
                <div className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{m.value}</div>
                <div className="mt-1 text-sm text-[var(--social-muted)]">{m.label}</div>
                <div className="mt-0.5 text-xs text-[var(--social-faint)]">{m.suffix}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">公开旅行</h2>
            <div className="h-px flex-1 bg-[var(--social-line)]" />
            <Link href={'/circle/user/' + profile.id} className="text-xs text-[var(--social-faint)] transition hover:text-[var(--social-text)]">查看全部 <ChevronRight className="inline h-3 w-3" /></Link>
          </div>
          {posts.length > 0 ? (
            <div className="mt-6 columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
              {posts.slice(0, 6).map((p, i) => <SocialFilmCard key={p.id} {...cardProps(p, FRAMES[i % FRAMES.length])} className="mb-5 break-inside-avoid" />)}
            </div>
          ) : (
            <div className="mt-6 rounded-[2rem] bg-[var(--social-surface-50)] px-6 py-16 text-center ring-1 ring-[var(--social-line)]">
              <p className="text-sm text-[var(--social-text)]">还没有把故事分享出去。</p>
              <Link href="/travel" className="mt-5 inline-block rounded-full bg-[var(--social-accent)] px-6 py-2.5 text-sm font-medium text-[var(--social-on-accent)]">去选择一段旅途</Link>
            </div>
          )}
        </section>

        {error && <p className="mt-6 text-sm text-[#E06C6C]">{error}</p>}

        <button onClick={logout} className="mt-12 inline-flex items-center gap-2 rounded-full bg-[var(--social-surface)] px-5 py-2.5 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]">
          <LogOut className="h-4 w-4" />退出登录
        </button>
      </div>

      {showEdit && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowEdit(false)} />
          <div className="absolute left-1/2 top-1/2 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[1.6rem] bg-[var(--social-surface)] p-5 ring-1 ring-[var(--social-line)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">编辑昵称</h3>
              <button onClick={() => setShowEdit(false)} className="rounded-full p-1 text-[var(--social-muted)] hover:text-[var(--social-text)]"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-[var(--social-faint)]">昵称仅用于展示，账号名 @{profile.username} 只能在后台修改。</p>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} placeholder="输入 1-24 位昵称" className="w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] transition focus:ring-[var(--social-accent)]" />
            <button onClick={saveNickname} disabled={savingNick || !nickname.trim()} className="mt-4 w-full rounded-full bg-[var(--social-accent)] py-3 text-sm font-semibold text-[var(--social-on-accent)] transition hover:bg-[var(--social-accent-strong)] disabled:opacity-50">
              {savingNick ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
