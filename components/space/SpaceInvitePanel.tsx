'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Gift, Ban, Clock, Link2 } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { Loader } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import { SPACE_ROLE_LABELS, spaceRoleLabelOf } from '@/lib/mobile/space-system'

interface Invite {
  id: number
  role: string
  code?: string
  expiresAt: string
  createdBy: string
  usedAt: string | null
  status: 'PENDING' | 'USED' | 'EXPIRED'
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

/**
 * 邀请面板（仅 OWNER）。
 *
 * 信息结构取自 `app/admin/spaces/page.tsx`（那一版已经比移动端弹窗完整）：
 * 角色 + 有效期选择、生成后展示码与链接、下方邀请记录带 PENDING/USED/EXPIRED 三态。
 * 视觉重做为移动端 token；并把 admin 版里缺失的「复制邀请链接」保留下来
 * （分享链接比让用户手抄 8 位码更符合移动端习惯）。
 */
export function SpaceInvitePanel({ spaceId }: { spaceId: number }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState('MEMBER')
  const [days, setDays] = useState(7)
  const [generated, setGenerated] = useState('')
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/invites`), { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) setInvites(j.invites || [])
    } catch {
      // 静默：邀请记录加载失败不应该挡住整个空间页
    } finally {
      setLoading(false)
    }
  }, [spaceId])

  useEffect(() => {
    void load()
  }, [load])

  const generate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/invites`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, expiresInDays: days }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '生成失败')
      setGenerated(j.code || '')
      await load()
    } catch (e: any) {
      setError(e.message || '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const revoke = async (inviteId: number) => {
    try {
      await fetch(apiUrl(`/api/spaces/${spaceId}/invites/${inviteId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      await load()
    } catch {
      setError('撤销失败')
    }
  }

  const copy = async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setError('复制失败，请手动选择文本')
    }
  }

  const inviteLink = (code: string) =>
    typeof window === 'undefined' ? '' : `${window.location.origin}/space?join=${code}`

  const pending = invites.filter((i) => i.status === 'PENDING')

  return (
    <div className="space-y-3">
      {/* 生成：角色 + 有效期 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="邀请角色"
          className="h-11 flex-1 rounded-[var(--m-radius-control)] bg-[var(--social-surface)] px-3 text-[13px] text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--space-accent)]"
        >
          <option value="MEMBER">{SPACE_ROLE_LABELS.MEMBER}（可一起编辑）</option>
          <option value="VIEWER">{SPACE_ROLE_LABELS.VIEWER}（只能查看）</option>
        </select>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10))}
          aria-label="有效期"
          className="h-11 rounded-[var(--m-radius-control)] bg-[var(--social-surface)] px-3 text-[13px] text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--space-accent)]"
        >
          <option value={1}>1 天</option>
          <option value={3}>3 天</option>
          <option value={7}>7 天</option>
          <option value={30}>30 天</option>
        </select>
        <Button icon={Gift} loading={generating} onClick={() => void generate()}>
          生成邀请码
        </Button>
      </div>

      {/* 生成结果：码 + 链接 */}
      {generated && (
        <div className="rounded-[var(--m-radius-control)] bg-[var(--space-accent-soft)] p-3.5">
          <p className="text-[13px] text-[var(--space-accent-text)]">
            把下面的邀请码或链接发给对方（{role === 'VIEWER' ? '只能查看' : '可一起编辑'}，
            {days} 天内有效）
          </p>
          <p className="mt-2 select-all text-center font-mono text-[18px] font-bold tracking-[0.28em] text-[var(--space-accent-strong)]">
            {generated}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              block
              icon={copied === 'code' ? Check : Copy}
              onClick={() => void copy(generated, 'code')}
            >
              复制邀请码
            </Button>
            <Button
              variant="secondary"
              size="sm"
              block
              icon={copied === 'link' ? Check : Link2}
              onClick={() => void copy(inviteLink(generated), 'link')}
            >
              复制链接
            </Button>
          </div>
        </div>
      )}

      {/* 邀请记录 */}
      <div>
        <p className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-[var(--social-muted)]">
          邀请记录
          {pending.length > 0 && (
            <span className="ml-1.5 tabular-nums text-[var(--social-faint)]">{pending.length} 个待使用</span>
          )}
        </p>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader variant="ring" />
          </div>
        ) : invites.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-[var(--social-faint)]">还没有邀请记录</p>
        ) : (
          <div className="space-y-1.5">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-[var(--m-radius-control)] bg-[var(--social-surface-60)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--social-text)]">
                    {spaceRoleLabelOf(inv.role)}
                    <span className="ml-2 text-[11px] text-[var(--social-faint)]">
                      {inv.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1">
                          <Icon icon={Clock} size="sm" />
                          {daysLeft(inv.expiresAt)} 天后过期
                        </span>
                      )}
                      {inv.status === 'USED' && '已使用'}
                      {inv.status === 'EXPIRED' && '已过期'}
                    </span>
                  </p>
                  {inv.code && inv.status === 'PENDING' && (
                    <p className="mt-0.5 select-all font-mono text-[13px] tracking-[0.2em] text-[var(--space-accent-strong)]">
                      {inv.code}
                    </p>
                  )}
                </div>
                {inv.status === 'PENDING' && (
                  <button
                    type="button"
                    aria-label="撤销邀请"
                    onClick={() => void revoke(inv.id)}
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--social-faint)] transition hover:text-[var(--danger-soft)]"
                  >
                    <Icon icon={Ban} size="sm" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-[13px] text-[var(--danger-soft)]">{error}</p>}
    </div>
  )
}

export default SpaceInvitePanel
