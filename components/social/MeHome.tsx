'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Home, LogOut, Camera, Pencil, Loader2, MapPin, Images, NotebookPen, Bookmark, ChevronRight, RefreshCw, Settings, ShieldCheck, Users, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import SpacePanel from '@/components/space/SpacePanel'
import { Modal } from '@/components/ui/Modal'

interface RecentTravel {
  id: number
  title: string
  slug: string
  location: string | null
  date: string | null
  coverUrl: string | null
  photoCount: number
}

interface MeProfile {
  id: number
  username: string
  nickname: string | null
  bio: string | null
  avatarUrl: string | null
  accountId: string | null
  createdAt: string | null
  summary: {
    travelCount: number
    placeCount: number
    photoCount: number
    travelDays: number | null
    momentCount: number
    favoriteCount: number
    likeCount: number
    provinceCount: number
  }
  companionStats?: Array<{
    name: string
    relation: string | null
    count: number
  }>
  recentTravel: RecentTravel | null
  capabilities: {
    isOwner: boolean
    canManageContent: boolean
    canManageSocial: boolean
    canManageSettings: boolean
    canManageSpace: boolean
    canViewAudit: boolean
  }
}

const FRAMES = ['portrait', 'landscape', 'square', 'wide', 'portrait', 'landscape'] as const
const DEFAULT_BIO = '把走过的路，变成值得记住的故事。'

export default function MeHome({ initial }: { initial: MeProfile }) {
  const router = useRouter()
  const [profile, setProfile] = useState<MeProfile>(initial)
  const [posts, setPosts] = useState<any[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [postsError, setPostsError] = useState(false)
  const [unread, setUnread] = useState(0)
  const [showEdit, setShowEdit] = useState(false)
  const [nickname, setNickname] = useState(initial.nickname || '')
  const [bio, setBio] = useState(initial.bio || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [showSpace, setShowSpace] = useState(false)

  const displayName = profile.nickname || profile.username
  const bioText = profile.bio || DEFAULT_BIO

  const loadPosts = useCallback(async () => {
    setPostsLoading(true)
    setPostsError(false)
    try {
      const r = await fetch('/api/social/users/' + initial.id)
      const j = await r.json()
      setPosts(j.data?.posts || [])
    } catch {
      setPostsError(true)
    } finally {
      setPostsLoading(false)
    }
  }, [initial.id])

  useEffect(() => {
    loadPosts()
    fetch('/api/social/notifications?page=1&pageSize=1')
      .then((r) => r.json())
      .then((j) => { if (j.data?.unread != null) setUnread(j.data.unread) })
      .catch(() => {})
  }, [loadPosts])

  const saveProfile = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, bio }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setProfile((p) => ({ ...p, nickname: json.data.nickname, bio: json.data.bio }))
        setShowEdit(false)
      } else {
        setError(json.error || '保存失败')
      }
    } catch { setError('网络错误') } finally { setSaving(false) }
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

  // v3.1 M2-E1：导出记忆档案（JSON + Markdown + 原图 ZIP）
  const [exporting, setExporting] = useState(false)
  const exportArchive = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const res = await fetch('/api/export/archive', { credentials: 'include' })
      if (!res.ok) {
        setError('导出失败，请稍后重试')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'travel-notes-archive.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('导出失败，请稍后重试')
    } finally {
      setExporting(false)
    }
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

  const recent = profile.recentTravel
  const recentDate = recent?.date ? recent.date.slice(0, 10) : ''

  const memories = [
    { icon: Images, label: '相册', value: profile.summary.photoCount, suffix: '张照片', href: '/album', photo: recent?.coverUrl || profile.avatarUrl },
    { icon: MapPin, label: '旅行', value: profile.summary.travelCount, suffix: '次旅途', href: '/travel', photo: recent?.coverUrl },
    { icon: NotebookPen, label: '碎碎念', value: profile.summary.momentCount, suffix: '条记录', href: '/moments' },
    { icon: Bookmark, label: '收藏', value: profile.summary.favoriteCount, suffix: '个记忆', href: '/me/favorites' },
  ]

  const coreStats = [
    ['次旅行', profile.summary.travelCount],
    ['个地点', profile.summary.placeCount],
    ['张照片', profile.summary.photoCount],
  ] as const

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%),radial-gradient(40%_40%_at_100%_0%,rgba(126,147,173,0.05),transparent_60%)]" />
      <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-[max(24px,env(safe-area-inset-top))] sm:px-6 sm:pt-8">
        <header className="mb-8 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--social-accent)]">My Archive</p>
            <h1 className="mt-1.5 truncate text-[30px] font-semibold leading-none tracking-tight">我的旅行档案</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            <SocialThemeToggle />
            {profile.capabilities.canManageSpace && (
              <button
                type="button"
                onClick={() => setShowSpace(true)}
                title="旅行空间"
                aria-label="旅行空间"
                className="hidden rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] sm:inline-flex"
              >
                <Users className="h-4 w-4" />
              </button>
            )}
            <Link href="/sync" title="数据与同步" aria-label="数据与同步" className="hidden rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] sm:inline-flex"><RefreshCw className="h-4 w-4" /></Link>
            <Link href="/me/notifications" aria-label="通知" className="relative rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><span className="text-base">✦</span>{unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--social-accent)]" />}</Link>
            <Link href="/" className="hidden items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-4 py-2 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] sm:inline-flex"><Home className="h-4 w-4" />返回首页</Link>
          </div>
        </header>

        <section className="m-enter grid gap-8 lg:grid-cols-[1.1fr_1.4fr] lg:gap-10">
          {/* 个人身份信息 */}
          <div>
            <div className="flex items-end gap-4">
              <div className="relative">
                <SocialAvatar name={displayName} avatarUrl={profile.avatarUrl} size={92} className="text-[26px]" />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="上传头像"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--social-accent)] text-[var(--social-on-accent)] ring-2 ring-[var(--social-bg)] transition hover:bg-[var(--social-accent-strong)] disabled:opacity-60">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
              </div>
              <button type="button" onClick={() => { setNickname(profile.nickname || ''); setBio(profile.bio || ''); setError(''); setShowEdit(true) }} aria-label="编辑资料"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-3 py-1.5 text-xs text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]">
                <Pencil className="h-3.5 w-3.5" />编辑资料
              </button>
            </div>

            <h2 className="mt-5 text-[28px] font-semibold leading-tight tracking-tight">{displayName}</h2>
            <p className="mt-1 text-sm text-[var(--social-muted)]">@{profile.username}</p>
            {profile.accountId && <span className="mt-3 inline-block rounded-full bg-[var(--social-accent-soft)] px-3 py-1 text-xs text-[var(--social-accent)]">ID {profile.accountId}</span>}
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-[var(--social-muted)]">「{bioText}」</p>
          </div>

          {/* 最近的一次旅行（第一视觉焦点） */}
          <div className="lg:pt-4">
            {recent ? (
              <Link href={'/travel/' + encodeURIComponent(recent.slug)} className="group relative block overflow-hidden rounded-[2rem] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]">
            <div className="relative aspect-[16/10]">
                  {recent.coverUrl ? (
                    <img src={recent.coverUrl} alt={recent.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--social-surface2)] text-[var(--social-faint)]"><MapPin className="h-8 w-8" /></div>
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-[#050505]/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--social-accent)]">最近的一次旅行</p>
                  <h3 className="mt-2 line-clamp-2 text-2xl font-semibold tracking-tight text-white">{recent.title}</h3>
                  <p className="mt-2 truncate text-sm text-white/75">{recent.location || ''}{recent.location ? ' · ' : ''}{recentDate}{recentDate ? ' · ' : ''}{recent.photoCount} 张照片</p>
                </div>
              </Link>
            ) : (
              <div className="flex aspect-[16/10] flex-col items-center justify-center gap-4 rounded-[2rem] bg-[var(--social-surface-60)] px-6 text-center ring-1 ring-[var(--social-line)]">
                <p className="text-sm text-[var(--social-text)]">还没有旅行记录</p>
                <Link href="/travel" className="inline-block rounded-full bg-[var(--social-accent)] px-5 py-2.5 text-sm font-medium text-[var(--social-on-accent)]">去记录第一次旅程 →</Link>
              </div>
            )}

            {/* 核心统计：旅行护照式，仅 3 个可靠指标（Days 因 Post 无天数来源而隐藏） */}
            <div className="mt-8 grid grid-cols-3 divide-x divide-[var(--social-line)] rounded-[1.6rem] bg-[var(--social-surface-50)] py-7 ring-1 ring-[var(--social-line)]">
              {coreStats.map(([label, value]) => (
                <div key={label} className="text-center">
                  <div className="text-3xl font-semibold tracking-tight text-[var(--social-text)] tabular-nums sm:text-4xl">{value}</div>
                  <div className="mt-1.5 text-xs text-[var(--social-muted)]">{label}</div>
                </div>
              ))}
            </div>

            {/* 同行者聚合：和 X 去过 N 次（来自 Travel.companions） */}
            {profile.companionStats && profile.companionStats.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--social-faint)]">和 TA 们去过</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {profile.companionStats.map((c) => (
                    <span
                      key={c.name}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-3 py-1.5 text-xs text-[var(--social-text)] ring-1 ring-[var(--social-line)]"
                    >
                      <span className="max-w-[8rem] truncate">{c.name}</span>
                      {c.relation && <span className="text-[var(--social-faint)]">· {c.relation}</span>}
                      <span className="tabular-nums text-[var(--social-accent)]">×{c.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 我的记忆 */}
        <section className="m-enter mt-16">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">我的记忆</h2>
            <div className="h-px flex-1 bg-[var(--social-line)]" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {memories.map((m, i) => (
              <Link key={m.label} href={m.href}
                className={cn('group relative overflow-hidden rounded-[1.4rem] ring-1 ring-[var(--social-line)] transition hover:ring-[var(--social-line-strong)]', i === 0 && 'ring-[var(--social-accent)]/40')}
                style={m.photo ? { aspectRatio: '1 / 1' } : { minHeight: '120px' }}>
                {m.photo ? (
                  <>
                    <img src={m.photo} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/85 via-[#050505]/25 to-transparent" />
                  </>
                ) : (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[var(--social-surface2)] to-[var(--social-surface)] p-4">
                    <m.icon className="h-6 w-6 text-[var(--social-accent)]" />
                    <div className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--social-text)]">{m.value}</div>
                    <div className="text-xs text-[var(--social-muted)]">{m.label} · {m.suffix}</div>
                  </div>
                )}
                {m.photo && (
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <div className="text-2xl font-semibold tracking-tight tabular-nums text-white">{m.value}</div>
                    <div className="mt-0.5 text-xs text-white/80">{m.label}</div>
                    <div className="text-xs text-white/60">{m.suffix}</div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>

        {/* 我的旅行故事 */}
        <section className="m-enter mt-14">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">我的旅行故事</h2>
            <div className="h-px flex-1 bg-[var(--social-line)]" />
            <Link href={'/circle/user/' + profile.id} className="text-xs text-[var(--social-faint)] transition hover:text-[var(--social-text)]">查看全部 <ChevronRight className="inline h-3 w-3" /></Link>
          </div>

          {postsLoading ? (
            <div className="mt-6 columns-1 gap-5 sm:columns-2 lg:columns-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="mb-5 break-inside-avoid overflow-hidden rounded-[1.4rem] bg-[var(--social-surface-80)] ring-1 ring-[var(--social-line)]">
                  <div className="aspect-[4/5] animate-pulse bg-[var(--social-surface2)]" />
                  <div className="space-y-3 p-4">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--social-surface2)]" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--social-surface2)]" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--social-surface2)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : postsError ? (
            <div className="mt-6 rounded-[2rem] bg-[var(--social-surface-50)] px-6 py-16 text-center ring-1 ring-[var(--social-line)]">
              <p className="text-sm text-[var(--social-muted)]">旅行故事暂时无法加载。</p>
              <button onClick={loadPosts} className="mt-5 inline-block rounded-full bg-[var(--social-accent)] px-6 py-2.5 text-sm font-medium text-[var(--social-on-accent)]">重新加载 →</button>
            </div>
          ) : posts.length > 0 ? (
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

        {/* 账号操作弱化（管理入口按能力显隐） */}
        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--social-faint)]">
          <button
            onClick={exportArchive}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 transition hover:text-[var(--social-accent)] disabled:opacity-50"
            title="导出旅行/回忆/碎碎念/照片的完整档案包"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? '导出中...' : '导出记忆档案'}
          </button>
          {profile.capabilities.canManageSettings && (
            <Link href="/admin/settings" className="inline-flex items-center gap-1.5 transition hover:text-[var(--social-accent)]">
              <Settings className="h-3.5 w-3.5" />账号设置
            </Link>
          )}
          {profile.capabilities.isOwner && (
            <Link href="/admin" className="inline-flex items-center gap-1.5 transition hover:text-[var(--social-accent)]">
              <ShieldCheck className="h-3.5 w-3.5" />管理后台
            </Link>
          )}
          <button onClick={logout} className="inline-flex items-center gap-1.5 transition hover:text-[var(--social-accent)]">
            <LogOut className="h-3.5 w-3.5" />退出登录
          </button>
        </div>
      </div>

      {showSpace && <SpacePanel open={showSpace} onClose={() => setShowSpace(false)} />}

      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        className="max-w-sm bg-[var(--social-surface)] ring-1 ring-[var(--social-line)] dark:bg-[var(--social-surface)]"
        title="编辑资料"
      >
        <p className="mb-3 text-xs text-[var(--social-faint)]">账号名 @{profile.username} 只能在后台修改。</p>
        <label className="mb-1.5 block text-xs text-[var(--social-muted)]">昵称</label>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} placeholder="输入 1-24 位昵称" className="w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] transition focus:ring-[var(--social-accent)]" />
        <label className="mb-1.5 mt-4 block text-xs text-[var(--social-muted)]">个性签名</label>
        <input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={120} placeholder="写一句话，成为你的旅行签名" className="w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] transition focus:ring-[var(--social-accent)]" />
        <button onClick={saveProfile} disabled={saving || !nickname.trim()} className="mt-4 w-full rounded-full bg-[var(--social-accent)] py-3 text-sm font-semibold text-[var(--social-on-accent)] transition hover:bg-[var(--social-accent-strong)] disabled:opacity-50">
          {saving ? '保存中…' : '保存'}
        </button>
      </Modal>
    </div>
  )
}
