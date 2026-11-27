'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Copy, Check, Gift, Ban, Clock, Link2 } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { Loader } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import { SPACE_ROLE_LABELS, spaceRoleLabelOf } from '@/lib/mobile/space-system'
import { SpaceSheetGroup, SpaceSheetGroups } from './SpaceSheetGroup'
import { SPACE_DUR, SPACE_EASE_OUT } from './space-motion'

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
 *
 * S2 视觉调整：生成区收成一张软底卡（角色/有效期/按钮同组），生成结果用主题色
 * accent-soft 卡片凸显邀请码；记录行去掉独立描边，改软底 + 三态弱化处理。
 * 交互与接口调用与重构前完全一致（不改契约）。
 *
 * U1 体验精修：
 *  · 内容分三组（新建邀请 / 邀请码 / 邀请记录），打开抽屉时依次淡入上浮；
 *  · 生成成功后邀请码卡从下方 8px 淡入，和"刚生成"这个动作对应上；
 *  · 复制成功的勾已在按钮图标位原地切换（不新增动画，避免和 toast 抢注意力）。
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
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '生成失败')
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
    <div className="space-y-4">
      <SpaceSheetGroups>
        <SpaceSheetGroup title="新建邀请" hint="角色 · 有效期">
          <div className="rounded-2xl bg-[var(--ui-social-surface-50)] p-3.5">
            <div className="flex flex-wrap gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="邀请角色"
                className="h-11 min-w-0 flex-1 rounded-2xl bg-[var(--ui-social-surface)] px-3 text-[13px] text-[var(--ui-social-text)] outline-none ring-1 ring-[var(--ui-social-line)] focus-visible:ring-[var(--ui-space-accent)]"
              >
                <option value="MEMBER">{SPACE_ROLE_LABELS.MEMBER}（可一起编辑）</option>
                <option value="VIEWER">{SPACE_ROLE_LABELS.VIEWER}（只能查看）</option>
              </select>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                aria-label="有效期"
                className="h-11 flex-none rounded-2xl bg-[var(--ui-social-surface)] px-3 text-[13px] text-[var(--ui-social-text)] outline-none ring-1 ring-[var(--ui-social-line)] focus-visible:ring-[var(--ui-space-accent)]"
              >
                <option value={1}>1 天</option>
                <option value={3}>3 天</option>
                <option value={7}>7 天</option>
                <option value={30}>30 天</option>
              </select>
            </div>
            <Button block className="mt-2.5" icon={Gift} loading={generating} onClick={() => void generate()}>
              生成邀请码
            </Button>
          </div>
        </SpaceSheetGroup>

        {/* 生成结果：码 + 链接。生成是一次"新内容出现"，所以给它一个入场（淡入 + 8px 上浮） */}
        {generated && (
          <SpaceSheetGroup title="邀请码" hint="发给对方即可">
            <motion.div
              className="rounded-2xl bg-[var(--ui-space-accent-soft)] p-3.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: SPACE_DUR.base, ease: SPACE_EASE_OUT }}
            >
              <p className="text-[13px] leading-5 text-[var(--ui-space-accent-text)]">
                把邀请码或链接发给对方（{role === 'VIEWER' ? '只能查看' : '可一起编辑'}，{days} 天内有效）
              </p>
              <p className="mt-2 select-all text-center font-mono text-[18px] font-bold tracking-[0.2em] text-[var(--ui-space-accent-strong)]">
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
            </motion.div>
          </SpaceSheetGroup>
        )}

        <SpaceSheetGroup title="邀请记录" hint={pending.length > 0 ? `${pending.length} 个待使用` : undefined}>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader variant="ring" />
            </div>
          ) : invites.length === 0 ? (
            <p className="py-3 text-center text-[13px] text-[var(--ui-social-faint)]">还没有邀请记录</p>
          ) : (
            <div className="space-y-1.5">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--ui-social-surface-50)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-[var(--ui-social-text)]">
                      {spaceRoleLabelOf(inv.role)}
                      <span className="ml-2 text-[11px] text-[var(--ui-social-faint)]">
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
                      <p className="mt-0.5 select-all font-mono text-[13px] tracking-[0.2em] text-[var(--ui-space-accent-strong)]">
                        {inv.code}
                      </p>
                    )}
                  </div>
                  {inv.status === 'PENDING' && (
                    <button
                      type="button"
                      aria-label="撤销邀请"
                      onClick={() => void revoke(inv.id)}
                      className="m-pressable flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--ui-social-faint)] hover:text-[var(--danger-soft)]"
                    >
                      <Icon icon={Ban} size="sm" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SpaceSheetGroup>
      </SpaceSheetGroups>

      {error && <p className="text-[13px] text-[var(--danger-soft)]">{error}</p>}
    </div>
  )
}

export default SpaceInvitePanel
