'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { UserMinus, ShieldCheck } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { SPACE_ROLE_HINTS, SPACE_ROLE_LABELS, spaceRoleLabelOf } from '@/lib/mobile/space-system'
import { SpaceAvatar, type SpaceMemberPreview } from './SpaceAvatarStack'
import { SPACE_DUR, SPACE_EASE_OUT } from './space-motion'

export interface SpaceMemberRow extends SpaceMemberPreview {
  id: number
  status: string
  joinedAt: string
}

const ROLE_ORDER = ['OWNER', 'MEMBER', 'VIEWER'] as const

function joinedText(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 加入`
}

/**
 * 成员列表 + 角色调整 + 移除。
 *
 * 信息结构借鉴 supabase/supabase `apps/studio/components/interfaces/Organization/
 * TeamSettings/`（Apache-2.0）：成员行 = 头像 + 名字 + 角色 + 行内操作。
 * 视觉全部重做为本项目的移动端 token（项目规范禁用裸 hex 与冷色）。
 *
 * S2 视觉调整：成员行从「独立小卡」改成「软底行」，只在行内做层次；
 * 角色控件收成胶囊 select，与新的卡片体系（2xl + 发丝线）一致。
 * 交互契约不变：只有 OWNER 能调角色/移除，最后一个主人由服务端兜底拒绝。
 *
 * U1 微交互：
 *  · 行按 40ms 错峰淡入上浮（打开成员面板时不是"啪"地出现一整列）；
 *  · 角色改成功后，该行铺一层主题色薄光呼吸一次（opacity 关键帧），
 *    明确告诉用户"是这一行变了"；失败则不变色，只出错误文案。
 *  · 薄光只是 opacity 动画、pointer-events: none，不挡 select / 移除按钮的点击。
 */
export function SpaceMemberList({
  spaceId,
  myRole,
  members,
  onChanged,
}: {
  spaceId: number
  myRole: string
  members: SpaceMemberRow[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** 刚改过角色的成员：行内薄光呼吸一次，避免"改了没反应" */
  const [flashUser, setFlashUser] = useState<string | null>(null)
  const isOwner = myRole === 'OWNER'

  const changeRole = async (username: string, role: string) => {
    setBusy(username)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/members`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '调整失败')
      setFlashUser(username)
      window.setTimeout(() => setFlashUser(null), 900)
      onChanged()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '调整失败')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (username: string) => {
    if (!window.confirm(`确定把「${username}」移出空间吗？TA 将立即失去空间内所有内容的访问权。`)) return
    setBusy(username)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/members`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '移除失败')
      onChanged()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '移除失败')
    } finally {
      setBusy(null)
    }
  }

  if (members.length === 0) {
    return <p className="py-6 text-center text-[13px] text-[var(--ui-social-faint)]">还没有成员</p>
  }

  return (
    <div className="space-y-2">
      {members.map((m, i) => {
        const canManage = isOwner && m.role !== 'OWNER'
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: SPACE_DUR.base, ease: SPACE_EASE_OUT, delay: Math.min(i, 6) * 0.04 }}
            className="relative overflow-hidden rounded-2xl bg-[var(--ui-social-surface-50)] px-3 py-2.5"
          >
            {flashUser === m.username && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[var(--ui-space-accent-soft)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.75, 0] }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            )}
            <div className="relative flex items-center gap-2.5">
              <SpaceAvatar member={m} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-[var(--ui-social-text)]">
                  {m.nickname || m.username}
                </p>
                <p className="truncate text-[11px] text-[var(--ui-social-faint)]">
                  {m.nickname ? `${m.username} · ` : ''}
                  {joinedText(m.joinedAt)}
                </p>
              </div>

              {canManage ? (
                <select
                  value={m.role}
                  disabled={busy === m.username}
                  onChange={(e) => void changeRole(m.username, e.target.value)}
                  aria-label={`调整 ${m.username} 的角色`}
                  className="h-8 flex-none rounded-full bg-[var(--ui-social-surface)] px-2.5 text-[13px] text-[var(--ui-social-text)] outline-none ring-1 ring-[var(--ui-social-line)] focus-visible:ring-[var(--ui-space-accent)] disabled:opacity-50"
                >
                  {ROLE_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {SPACE_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex-none rounded-full bg-[var(--ui-social-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ui-social-muted)]">
                  {spaceRoleLabelOf(m.role)}
                </span>
              )}

              {canManage && (
                <button
                  type="button"
                  aria-label={`移除 ${m.username}`}
                  disabled={busy === m.username}
                  onClick={() => void remove(m.username)}
                  className="m-pressable flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--ui-social-faint)] hover:text-[var(--danger-soft)] disabled:opacity-50"
                >
                  <Icon icon={UserMinus} size="sm" />
                </button>
              )}
            </div>
          </motion.div>
        )
      })}

      {isOwner && (
        <div className="mt-3 rounded-2xl bg-[var(--ui-social-surface-50)] px-3 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-[var(--ui-social-muted)]">
            <Icon icon={ShieldCheck} size="sm" className="shrink-0" />
            角色区别
          </p>
          <dl className="mt-2 space-y-1.5">
            {ROLE_ORDER.map((r) => (
              <div key={r} className="flex gap-2 text-[11px] leading-4">
                <dt className="w-8 flex-none font-medium text-[var(--ui-social-muted)]">
                  {SPACE_ROLE_LABELS[r]}
                </dt>
                <dd className="text-[var(--ui-social-faint)]">{SPACE_ROLE_HINTS[r]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] leading-4 text-[var(--ui-social-faint)]">
            空间至少保留一位主人，最后一位主人不能被降级或移除。
          </p>
        </div>
      )}

      {error && <p className="pt-1 text-[13px] text-[var(--danger-soft)]">{error}</p>}
    </div>
  )
}

export default SpaceMemberList
