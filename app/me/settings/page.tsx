'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { ListSection, ListRow } from '@/components/mobile/ListRow'
import { apiUrl } from '@/lib/api-base'
import { useApi } from '@/lib/client/use-api'
import { isMobileShell } from '@/lib/routes'
import { toast } from '@/lib/mobile/toast-store'
import { useSessionRedirect } from '@/hooks/use-session-redirect'

/**
 * 「账号设置」独立页（R3）。
 *
 * 为什么新增：原先「我的 → 账号设置」直接链到 `/admin/settings` ——
 *  · `/admin` 在原生壳里**没有打包**（`build-mobile.cjs` 把它移出了 app/），点进去是空白；
 *  · 后台那套是桌面界面（左侧栏 + 表格），手机上本就不好用；
 *  · 而且它没有返回键，底部 tab 又被 `LayoutContent` 排除 → 用户在移动端"无路可退"。
 *
 * 这一页只放**手机上真正会改**的几项：昵称/签名（走 `/api/me/profile`）、
 * 密码与邮箱（跳对应流程）、通知与数据（复用已有页面）、导出与退出。
 */

interface MeInfo {
  username: string
  nickname: string | null
  bio: string | null
  accountId: string | null
  email?: string | null
  capabilities: {
    isOwner: boolean
    canManageSettings: boolean
  }
}

export default function MeSettingsPage() {
  const router = useRouter()
  const native = isMobileShell()
  /**
   * 用统一取数层：它把「中间件 307 → /login」归一成 401 ApiError，
   * 于是会话失效能被 `useSessionRedirect` 识别并送去登录页（手写 fetch 会漏掉这一步）。
   */
  const { data, error: loadError, loading, reload } = useApi<MeInfo>(apiUrl('/api/me'))
  const expired = useSessionRedirect(loadError)

  const info = data ?? null
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!data) return
    setNickname(data.nickname ?? '')
    setBio(data.bio ?? '')
  }, [data])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/me/profile'), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, bio }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '保存失败')
      toast.success('已保存')
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const logout = async () => {
    try {
      await fetch(apiUrl('/api/logout'), { method: 'POST', credentials: 'include' })
    } catch {}
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-[calc(96px+env(safe-area-inset-bottom))] text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[320px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      <div className="relative mx-auto max-w-2xl px-4 pb-8 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 sm:py-8">
        <LargeTitle title="账号设置" subtitle="资料、安全与账号" back="/me" />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[var(--social-faint)]">
            <Icon icon={Loader2} size="md" className="animate-spin" />
            <span className="text-sm">加载中…</span>
          </div>
        ) : (
          <>
            {/* 资料 */}
            <section className="mt-6 rounded-[1.4rem] bg-[var(--social-surface)] p-5 ring-1 ring-[var(--social-line)]">
              <div className="flex items-center gap-2">
                <Icon icon={User} size="sm" tone="accent" />
                <h2 className="text-sm font-semibold">资料</h2>
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-xs text-[var(--social-muted)]">账号名（不可在此修改）</p>
                <p className="text-sm">@{info?.username}</p>
                {info?.accountId && (
                  <p className="text-xs text-[var(--social-faint)]">ID {info.accountId}</p>
                )}
              </div>

              <label className="mt-4 block text-xs text-[var(--social-muted)]">昵称</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={24}
                placeholder="输入 1-24 位昵称"
                className="mt-1.5 w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--social-accent)]"
              />

              <label className="mt-4 block text-xs text-[var(--social-muted)]">个性签名</label>
              <input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={120}
                placeholder="写一句话，成为你的旅行签名"
                className="mt-1.5 w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--social-accent)]"
              />

              {error && <p className="mt-3 text-sm text-[var(--danger-soft)]">{error}</p>}

              <button
                type="button"
                onClick={save}
                disabled={saving || !nickname.trim()}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--social-accent)] text-sm font-semibold text-[var(--social-on-accent)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? <Icon icon={Loader2} size="sm" className="animate-spin" /> : <Icon icon={Save} size="sm" />}
                {saving ? '保存中…' : '保存资料'}
              </button>
            </section>

            {/* 安全 */}
            <ListSection title="安全" className="mt-6">
              <ListRow icon={KeyRound} tone="sun" title="修改密码" description="定期更换更安全" href="/admin/change-password" />
              <ListRow icon={Mail} tone="clay" title="邮箱" description={info?.email || '未绑定（用于找回密码）'} href="/admin/settings" />
            </ListSection>

            {/* 内容与数据 */}
            <ListSection title="内容与数据" className="mt-6">
              <ListRow icon={Bell} tone="accent" title="通知" description="评论、点赞与关注" href="/me/notifications" />
              <ListRow
                icon={Download}
                tone="clay"
                title="导出记忆档案"
                description="旅行 / 回忆 / 碎碎念 / 照片打包下载"
                onClick={async () => {
                  try {
                    const res = await fetch(apiUrl('/api/export/archive'), { credentials: 'include' })
                    if (!res.ok) throw new Error('导出失败')
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
                    toast.error('导出失败，请稍后重试')
                  }
                }}
              />
              {/* 管理后台只在 Web 构建里存在（原生壳没打包 /admin） */}
              {info?.capabilities?.isOwner && !native && (
                <ListRow icon={ShieldCheck} tone="accent" title="管理后台" description="内容、成员与审计日志" href="/admin" />
              )}
            </ListSection>

            <button
              type="button"
              onClick={logout}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-[1.4rem] bg-[var(--social-surface)] py-3.5 text-sm font-medium text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition active:scale-[0.99]"
            >
              <Icon icon={LogOut} size="sm" />
              退出登录
            </button>

            <p className="mt-4 text-center text-[11px] text-[var(--social-faint)]">
              想改头像与档案头图？回<Link href="/me" className="mx-1 underline underline-offset-2">我的</Link>页直接点即可
            </p>
          </>
        )}
      </div>
    </div>
  )
}
