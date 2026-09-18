'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  ChartColumn,
  ChevronRight,
  Download,
  Images,
  LogOut,
  NotebookPen,
  RefreshCw,
  Route,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Bell,
  Bookmark,
  Compass,
  Plane,
  Clock,
} from 'lucide-react'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import SpacePanel from '@/components/space/SpacePanel'
import ProfileHero from '@/components/social/ProfileHero'
import { Modal } from '@/components/ui/Modal'
import { apiUrl } from '@/lib/api-base'
import { travelDetailHref } from '@/lib/routes'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { ListSection, ListRow } from '@/components/mobile/ListRow'
import { Icon } from '@/components/mobile/Icon'
import { base64ToBytes, extFromMime } from '@/lib/media/pick-image'

/**
 * 「我的」页（R1 重构）。
 *
 * 定位调整：这里是**账号与设置的归属地 + 一份旅行档案摘要**，不再是第二个内容页。
 * 因此删掉了「我的旅行故事」瀑布流与「我的记忆」四宫格 —— 旅行内容在 `/travel`、
 * 画册在 `/album`、旅行圈在 `/circle`，「我的」只留：
 *   ① 档案头图（头像 / 名号 / 三统计）
 *   ② 我的空间（情侣/家人/朋友一起经营）
 *   ③ 记录（原首页「更多玩法」搬来：时间线 / 碎碎念 / 数据看板 / 收藏 / 旅行圈）
 *   ④ 设置（通知 / 数据同步 / 导出 / 账号 / 退出）
 *
 * 口径修复见 `lib/modules/social/profile.service.ts`：那三个统计数字此前读的是旧文章表
 * （`Post(type='travel')`），App 里建的旅行一个都没算进去。
 */

interface MeProfile {
  id: number
  username: string
  nickname: string | null
  bio: string | null
  avatarUrl: string | null
  coverUrl: string | null
  coverFocusX: number | null
  coverFocusY: number | null
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
  companionStats?: Array<{ name: string; relation: string | null; count: number }>
  recentTravel: { id: number; title: string; slug: string; location: string | null; date: string | null; coverUrl: string | null; photoCount: number } | null
  upcomingTravel: {
    id: number
    title: string
    slug: string
    location: string | null
    startDate: string | null
    daysUntilStart: number
    coverUrl: string | null
  } | null
  capabilities: {
    isOwner: boolean
    canManageContent: boolean
    canManageSocial: boolean
    canManageSettings: boolean
    canManageSpace: boolean
    canViewAudit: boolean
  }
}

const DEFAULT_BIO = '把走过的路，变成值得记住的故事。'

export default function MeHome({ initial }: { initial: MeProfile }) {
  const router = useRouter()
  const [profile, setProfile] = useState<MeProfile>(initial)
  const [unread, setUnread] = useState(0)
  const [showEdit, setShowEdit] = useState(false)
  const [nickname, setNickname] = useState(initial.nickname || '')
  const [bio, setBio] = useState(initial.bio || '')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [error, setError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [showSpace, setShowSpace] = useState(false)

  const displayName = profile.nickname || profile.username
  const bioText = profile.bio || DEFAULT_BIO

  useEffect(() => {
    fetch(apiUrl('/api/social/notifications?page=1&pageSize=1'), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.data?.unread != null) setUnread(j.data.unread)
      })
      .catch(() => {})
  }, [])

  const refreshAll = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/me'), { credentials: 'include' })
      const j = await r.json()
      if (j?.data) setProfile(j.data)
    } catch {
      // 保留现有档案
    }
  }, [])

  const saveProfile = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/me/profile'), {
        method: 'PATCH',
        credentials: 'include',
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
    } catch {
      setError('网络错误')
    } finally {
      setSaving(false)
    }
  }

  /** 头像上传（原生壳走 pickImage，Web 走 file input，两条路径归一） */
  const uploadAvatar = useCallback(async (file: File | null, picked?: { base64: string; mimeType: string }) => {
    setUploadingAvatar(true)
    setError('')
    try {
      const form = new FormData()
      if (picked) {
        const bytes = base64ToBytes(picked.base64)
        form.append('avatar', new Blob([bytes as unknown as BlobPart], { type: picked.mimeType }), `avatar.${extFromMime(picked.mimeType)}`)
      } else if (file) {
        form.append('avatar', file)
      } else {
        return
      }
      const res = await fetch(apiUrl('/api/me/avatar'), { method: 'POST', credentials: 'include', body: form })
      const json = await res.json()
      if (res.ok && json.data) setProfile((p) => ({ ...p, avatarUrl: json.data.avatarUrl }))
      else setError(json.error || '头像上传失败')
    } catch {
      setError('网络错误')
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }, [])

  const onPickAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    void uploadAvatar(e.target.files?.[0] ?? null)
  }

  /** 头图上传：原生壳用 pickImage（相机/相册），Web 用 file input */
  const uploadCover = useCallback(async (file: File | null, picked?: { base64: string; mimeType: string }) => {
    setUploadingCover(true)
    setError('')
    try {
      const form = new FormData()
      if (picked) {
        const bytes = base64ToBytes(picked.base64)
        form.append('cover', new Blob([bytes as unknown as BlobPart], { type: picked.mimeType }), `cover.${extFromMime(picked.mimeType)}`)
      } else if (file) {
        form.append('cover', file)
      } else {
        return
      }
      const res = await fetch(apiUrl('/api/me/cover'), { method: 'POST', credentials: 'include', body: form })
      const json = await res.json()
      if (res.ok && json.data) {
        setProfile((p) => ({
          ...p,
          coverUrl: json.data.coverUrl,
          coverFocusX: json.data.coverFocusX,
          coverFocusY: json.data.coverFocusY,
        }))
      } else {
        setError(json.error || '头图上传失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setUploadingCover(false)
    }
  }, [])

  const coveredFileRef = useRef<HTMLInputElement | null>(null)

  const logout = async () => {
    try {
      await fetch(apiUrl('/api/logout'), { method: 'POST', credentials: 'include' })
    } catch {}
    router.push('/login')
  }

  // v3.1 M2-E1：导出记忆档案（JSON + Markdown + 原图 ZIP）
  const [exporting, setExporting] = useState(false)
  const exportArchive = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const res = await fetch(apiUrl('/api/export/archive'), { credentials: 'include' })
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

  const heroData = {
    username: profile.username,
    displayName,
    accountId: profile.accountId,
    bio: bioText,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
    coverFocusX: profile.coverFocusX,
    coverFocusY: profile.coverFocusY,
    stats: {
      travelCount: profile.summary.travelCount,
      placeCount: profile.summary.placeCount,
      photoCount: profile.summary.photoCount,
    },
    provinceCount: profile.summary.provinceCount,
  }

  const upcoming = profile.upcomingTravel

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%),radial-gradient(40%_40%_at_100%_0%,rgba(126,147,173,0.05),transparent_60%)]" />

      <div className="relative mx-auto max-w-2xl px-4 pb-6 pt-[max(20px,env(safe-area-inset-top))] sm:px-6 sm:pt-8">
        <PullToRefresh onRefresh={refreshAll}>
          {/* 移动端：iOS 大标题 + 关键操作 */}
          <div className="md:hidden">
            <LargeTitle
              title="我的"
              subtitle={displayName}
              trailing={
                <div className="flex items-center gap-2">
                  <SocialThemeToggle />
                  <Link
                    href="/me/notifications"
                    aria-label="通知"
                    className="m-pressable relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--social-muted)] ring-1 ring-[var(--social-line)]"
                  >
                    <Icon icon={Bell} size="md" />
                    {unread > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--social-accent)]" />
                    )}
                  </Link>
                </div>
              }
            />
          </div>

          <header className="mb-5 hidden items-center justify-between gap-3 md:flex">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--social-accent)]">My Archive</p>
              <h1 className="mt-1.5 truncate text-[26px] font-semibold leading-none tracking-tight">我的</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SocialThemeToggle />
              <Link
                href="/me/notifications"
                aria-label="通知"
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"
              >
                <Icon icon={Bell} size="md" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--social-accent)]" />
                )}
              </Link>
            </div>
          </header>

          {/* ① 档案头图 */}
          <section className="m-enter">
            <ProfileHero
              data={heroData}
              uploadingCover={uploadingCover}
              uploadingAvatar={uploadingAvatar}
              onPickAvatar={() => avatarInputRef.current?.click()}
              onPickCover={() => coveredFileRef.current?.click()}
              onEditProfile={() => {
                setNickname(profile.nickname || '')
                setBio(profile.bio || '')
                setError('')
                setShowEdit(true)
              }}
              onRecordTravel={() => router.push('/travel/new')}
              onOpenAlbum={() => router.push('/album')}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              aria-label="选择头像图片"
              className="hidden"
              onChange={onPickAvatarFile}
            />
            <input
              ref={coveredFileRef}
              type="file"
              accept="image/*"
              aria-label="选择头图图片"
              className="hidden"
              onChange={(e) => void uploadCover(e.target.files?.[0] ?? null)}
            />
          </section>

          {/* 下一趟未出发的旅行（有才显示） */}
          {upcoming && (
            <Link
              href={travelDetailHref(upcoming.slug)}
              className="m-enter m-press mt-4 flex items-center gap-3 rounded-[1.4rem] bg-[var(--social-surface)] p-4 ring-1 ring-[var(--social-line)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--social-accent-soft)] text-[var(--social-accent)]">
                <Icon icon={Plane} size="md" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{upcoming.title}</span>
                <span className="mt-0.5 block text-xs text-[var(--social-muted)]">
                  {upcoming.location ? `${upcoming.location} · ` : ''}
                  {upcoming.daysUntilStart === 0 ? '今天出发' : `还有 ${upcoming.daysUntilStart} 天出发`}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--social-accent)]">
                <Icon icon={Clock} size="sm" />
                准备中
              </span>
            </Link>
          )}

          {/* ② 我的空间 */}
          <section className="m-enter mt-6">
            <div className="flex items-center gap-3 px-1">
              <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">我的空间</h2>
              <div className="h-px flex-1 bg-[var(--social-line)]" />
            </div>
            <button
              type="button"
              onClick={() => setShowSpace(true)}
              className="m-press mt-3 flex w-full items-center gap-4 rounded-[1.4rem] bg-[var(--social-surface)] p-4 text-left ring-1 ring-[var(--social-line)]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--social-accent-soft)] text-[var(--social-accent)]">
                <Icon icon={Users} size="md" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">情侣 / 家人 / 朋友空间</span>
                <span className="mt-0.5 block text-xs text-[var(--social-muted)]">
                  邀请 TA 一起经营旅行记录，还能一起规划下一次
                </span>
              </span>
              <Icon icon={ChevronRight} size="sm" tone="faint" />
            </button>
          </section>

          {/* ③ 记录（原首页「更多玩法」搬来） */}
          <ListSection title="记录" className="m-enter mt-6">
            <ListRow icon={Route} tone="accent" title="我的旅行" description="地图、列表与全部旅途" href="/travel" />
            <ListRow icon={Images} tone="sun" title="旅行画册" description="按城市成册，翻页阅读" href="/album" />
            <ListRow icon={CalendarDays} tone="clay" title="时间线" description="按年份回顾每一段旅程" href="/timeline" />
            <ListRow icon={NotebookPen} tone="blush" title="碎碎念" description="写下此刻想说的话" href="/moments" />
            <ListRow icon={ChartColumn} tone="accent" title="数据看板" description="足迹与照片的全部沉淀" href="/dashboard" />
            <ListRow icon={Bookmark} tone="sun" title="我的收藏" description="收藏过的旅行故事" href="/me/favorites" />
            <ListRow icon={Compass} tone="clay" title="旅行圈" description="看看别人眼中的世界" href="/circle" />
          </ListSection>

          {/* 同行者聚合（弱化呈现，不抢三统计的位置） */}
          {profile.companionStats && profile.companionStats.length > 0 && (
            <section className="m-enter mt-6">
              <div className="flex items-center gap-3 px-1">
                <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">和 TA 们去过</h2>
                <div className="h-px flex-1 bg-[var(--social-line)]" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.companionStats.map((c) => (
                  <span
                    key={c.name}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-3 py-1.5 text-xs ring-1 ring-[var(--social-line)]"
                  >
                    <span className="max-w-[8rem] truncate">{c.name}</span>
                    {c.relation && <span className="text-[var(--social-faint)]">· {c.relation}</span>}
                    <span className="tabular-nums text-[var(--social-accent)]">×{c.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ④ 设置 */}
          <ListSection title="设置" className="m-enter mt-6">
            <ListRow
              icon={Bell}
              tone="accent"
              title="通知"
              description={unread > 0 ? `${unread} 条未读` : '评论、点赞与关注'}
              href="/me/notifications"
            />
            <ListRow icon={RefreshCw} tone="sun" title="数据与同步" description="离线内容与同步状态" href="/sync" />
            <ListRow
              icon={Download}
              tone="clay"
              title={exporting ? '正在导出…' : '导出记忆档案'}
              description="旅行 / 回忆 / 碎碎念 / 照片打包下载"
              onClick={exportArchive}
            />
            {profile.capabilities.canManageSettings && (
              <ListRow icon={Settings} tone="blush" title="账号设置" description="密码、邮箱与账号信息" href="/admin/settings" />
            )}
            {profile.capabilities.isOwner && (
              <ListRow icon={ShieldCheck} tone="accent" title="管理后台" description="内容、成员与审计日志" href="/admin" />
            )}
          </ListSection>

          {error && <p className="mt-4 px-1 text-sm text-[var(--danger-soft)]">{error}</p>}

          <button
            type="button"
            onClick={logout}
            className="m-press mt-6 flex w-full items-center justify-center gap-2 rounded-[1.4rem] bg-[var(--social-surface)] py-3.5 text-sm font-medium text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition active:scale-[0.99]"
          >
            <Icon icon={LogOut} size="sm" />
            退出登录
          </button>

          <p className="mt-4 text-center text-[11px] text-[var(--social-faint)]">
            <Sparkles className="mr-1 inline align-[-2px]" size={11} />
            行迹 · 把走过的路，变成值得记住的故事
          </p>
        </PullToRefresh>
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
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={24}
          placeholder="输入 1-24 位昵称"
          className="w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] transition focus:ring-[var(--social-accent)]"
        />
        <label className="mb-1.5 mt-4 block text-xs text-[var(--social-muted)]">个性签名</label>
        <input
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={120}
          placeholder="写一句话，成为你的旅行签名"
          className="w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] transition focus:ring-[var(--social-accent)]"
        />
        <button
          onClick={saveProfile}
          disabled={saving || !nickname.trim()}
          className="mt-4 w-full rounded-full bg-[var(--social-accent)] py-3 text-sm font-semibold text-[var(--social-on-accent)] transition hover:bg-[var(--social-accent-strong)] disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </Modal>
    </div>
  )
}
