'use client'

import { useState } from 'react'
import { UserMinus, ShieldCheck } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { SPACE_ROLE_HINTS, SPACE_ROLE_LABELS, spaceRoleLabelOf } from '@/lib/mobile/space-system'
import { SpaceAvatar, type SpaceMemberPreview } from './SpaceAvatarStack'

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
 * 权限：只有 OWNER 能调整角色 / 移除成员；「最后一个主人」由服务端兜底拒否
 * （`spaceService.updateMemberRole`），前端只做显隐，不做安全假设。
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
      onChanged()
    } catch (e: any) {
      setError(e.message || '调整失败')
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
    } catch (e: any) {
      setError(e.message || '移除失败')
    } finally {
      setBusy(null)
    }
  }

  if (members.length === 0) {
    return <p className="py-4 text-center text-[13px] text-[var(--social-faint)]">还没有成员</p>
  }

  return (
    <div className="space-y-1.5">
      {members.map((m) => {
        const canManage = isOwner && m.role !== 'OWNER'
        return (
          <div
            key={m.id}
            className="rounded-[var(--m-radius-control)] bg-[var(--social-surface-60)] px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <SpaceAvatar member={m} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-[var(--social-text)]">
                  {m.nickname || m.username}
                </p>
                <p className="truncate text-[11px] text-[var(--social-faint)]">
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
                  className="h-9 rounded-[10px] bg-[var(--social-surface)] px-2 text-[13px] text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--space-accent)] disabled:opacity-50"
                >
                  {ROLE_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {SPACE_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex-none rounded-full bg-[var(--social-surface2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--social-muted)]">
                  {spaceRoleLabelOf(m.role)}
                </span>
              )}

              {canManage && (
                <button
                  type="button"
                  aria-label={`移除 ${m.username}`}
                  disabled={busy === m.username}
                  onClick={() => void remove(m.username)}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--social-faint)] transition hover:text-[var(--danger-soft)] disabled:opacity-50"
                >
                  <Icon icon={UserMinus} size="sm" />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {isOwner && (
        <div className="rounded-[var(--m-radius-control)] bg-[var(--social-surface-50)] px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--social-muted)]">
            <Icon icon={ShieldCheck} size="sm" className="shrink-0" />
            角色区别
          </p>
          <dl className="mt-1.5 space-y-1">
            {ROLE_ORDER.map((r) => (
              <div key={r} className="flex gap-2 text-[11px] leading-4">
                <dt className="w-8 flex-none font-medium text-[var(--social-muted)]">
                  {SPACE_ROLE_LABELS[r]}
                </dt>
                <dd className="text-[var(--social-faint)]">{SPACE_ROLE_HINTS[r]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-[11px] leading-4 text-[var(--social-faint)]">
            空间至少保留一位主人，最后一位主人不能被降级或移除。
          </p>
        </div>
      )}

      {error && <p className="pt-1 text-[13px] text-[var(--danger-soft)]">{error}</p>}
    </div>
  )
}

export default SpaceMemberList
