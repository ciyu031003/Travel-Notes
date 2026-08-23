'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, Loader2, X, Plus, KeyRound, Sparkles, RefreshCw, Copy, Trash2, UserMinus, ChevronDown, ChevronUp } from 'lucide-react'
import { apiUrl } from '@/lib/api-base'

/**
 * 移动端空间协作面板（D1）：
 * - 无空间：创建空间（名称/简介，slug 自动生成）或输入邀请码加入；
 * - 有空间：展示空间信息（成员数/共享统计/我的角色）。
 * 邀请码/成员管理在 D1b 扩展。
 */

interface SpaceInfo {
  id: number
  name: string
  slug: string
  description: string | null
  memberCount: number
  myRole: 'OWNER' | 'MEMBER' | 'VIEWER'
  albumCount?: number
  travelCount?: number
  memoryCount?: number
  mediaCount?: number
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: '主人',
  MEMBER: '成员',
  VIEWER: '访客',
}

interface SpaceMember {
  id: number
  username: string
  role: 'OWNER' | 'MEMBER' | 'VIEWER'
  status: string
  joinedAt: string
}

interface SpaceInvite {
  id: number
  spaceId: number
  role: 'OWNER' | 'MEMBER' | 'VIEWER'
  code?: string
  expiresAt: string
  status: 'PENDING' | 'USED' | 'EXPIRED'
}

export default function SpacePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [spaces, setSpaces] = useState<SpaceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 创建表单
  const [createMode, setCreateMode] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 加入表单
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)

  // 空间详情（成员/邀请码）
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [members, setMembers] = useState<Record<number, SpaceMember[]>>({})
  const [invites, setInvites] = useState<Record<number, SpaceInvite[]>>({})
  const [loadingDetail, setLoadingDetail] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/spaces'), { credentials: 'include' })
      const j = await res.json()
      if (res.ok) setSpaces(j.spaces || [])
      else setError(j.error || '加载空间失败')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  if (!open) return null

  const loadDetail = async (spaceId: number) => {
    setLoadingDetail((d) => ({ ...d, [spaceId]: true }))
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(apiUrl(`/api/spaces/${spaceId}/members`), { credentials: 'include' }),
        fetch(apiUrl(`/api/spaces/${spaceId}/invites`), { credentials: 'include' }),
      ])
      const mj = await mRes.json().catch(() => ({}))
      const ij = await iRes.json().catch(() => ({}))
      if (mRes.ok) setMembers((m) => ({ ...m, [spaceId]: mj.members || [] }))
      if (iRes.ok) setInvites((i) => ({ ...i, [spaceId]: ij.invites || [] }))
    } catch {
      // 忽略
    } finally {
      setLoadingDetail((d) => ({ ...d, [spaceId]: false }))
    }
  }

  const toggleExpand = (spaceId: number) => {
    const next = expandedId === spaceId ? null : spaceId
    setExpandedId(next)
    if (next !== null && !members[next]) loadDetail(next)
  }

  const generateInvite = async (spaceId: number) => {
    setMessage(null)
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/invites`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'MEMBER', expiresInDays: 7 }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '生成失败')
      setMessage({ type: 'ok', text: '邀请码已生成，复制发给你的另一半' })
      await loadDetail(spaceId)
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || '生成失败' })
    }
  }

  const revokeInvite = async (spaceId: number, inviteId: number) => {
    setMessage(null)
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/invites/${inviteId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('撤销失败')
      setMessage({ type: 'ok', text: '邀请码已撤销' })
      await loadDetail(spaceId)
    } catch {
      setMessage({ type: 'err', text: '撤销失败' })
    }
  }

  const removeMember = async (spaceId: number, username: string) => {
    setMessage(null)
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/members`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (!res.ok) throw new Error('移除失败')
      setMessage({ type: 'ok', text: `已移除成员 ${username}` })
      await loadDetail(spaceId)
    } catch {
      setMessage({ type: 'err', text: '移除失败' })
    }
  }

  const copyCode = (spaceId: number, code: string) => {
    try {
      navigator.clipboard.writeText(code)
      setCopied((c) => ({ ...c, [spaceId]: true }))
      setTimeout(() => setCopied((c) => ({ ...c, [spaceId]: false })), 1500)
    } catch {
      // 忽略
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    setMessage(null)
    try {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'space-' + Date.now()
      const res = await fetch(apiUrl('/api/spaces'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug, description: description.trim() || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '创建失败')
      setMessage({ type: 'ok', text: '空间创建成功，可以邀请你的另一半了' })
      setName('')
      setDescription('')
      setCreateMode(false)
      await load()
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || '创建失败' })
    } finally {
      setSubmitting(false)
    }
  }

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim()
    if (!code) return
    setJoining(true)
    setError('')
    setMessage(null)
    try {
      const res = await fetch(apiUrl('/api/spaces/join'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '加入失败')
      setMessage({ type: 'ok', text: `已加入「${j.spaceName || ''}」${j.role === 'MEMBER' ? '，从此一起记录' : ''}` })
      setJoinCode('')
      await load()
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || '加入失败' })
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 flex max-h-[86vh] w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.6rem] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]">
        <div className="flex items-center justify-between border-b border-[var(--social-line)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-[var(--social-accent)]" />
            我们的空间
          </h3>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-[var(--social-muted)] hover:text-[var(--social-text)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center py-12 text-[var(--social-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="mt-3 text-sm">加载中...</p>
            </div>
          ) : spaces.length > 0 ? (
            <div className="space-y-4">
              {spaces.map((s) => (
                <div key={s.id} className="overflow-hidden rounded-2xl bg-[var(--social-bg)] ring-1 ring-[var(--social-line)]">
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{s.name}</h4>
                      <span className="rounded-full bg-[var(--social-accent-soft)] px-2.5 py-0.5 text-xs text-[var(--social-accent)]">
                        {ROLE_LABEL[s.myRole] || s.myRole}
                      </span>
                    </div>
                    {s.description && <p className="mt-1 text-xs text-[var(--social-muted)]">{s.description}</p>}
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      {[
                        ['成员', s.memberCount],
                        ['旅行', s.travelCount ?? 0],
                        ['相册', s.albumCount ?? 0],
                        ['回忆', s.memoryCount ?? 0],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl bg-[var(--social-surface-60)] py-2">
                          <div className="text-lg font-semibold tabular-nums">{value}</div>
                          <div className="text-[11px] text-[var(--social-faint)]">{label}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(s.id)}
                      className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs text-[var(--social-faint)] transition hover:text-[var(--social-accent)]"
                    >
                      {expandedId === s.id ? <><ChevronUp className="h-3.5 w-3.5" />收起成员与邀请</> : <><ChevronDown className="h-3.5 w-3.5" />成员与邀请（{s.memberCount} 人）</>}
                    </button>
                  </div>

                  {expandedId === s.id && (
                    <div className="border-t border-[var(--social-line)] px-4 py-3">
                      {loadingDetail[s.id] ? (
                        <div className="flex justify-center py-6 text-[var(--social-faint)]"><Loader2 className="h-5 w-5 animate-spin" /></div>
                      ) : (
                        <div className="space-y-4">
                          {/* 成员列表 */}
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--social-faint)]">成员</p>
                            <div className="space-y-1.5">
                              {(members[s.id] || []).map((m) => (
                                <div key={m.id} className="flex items-center justify-between rounded-xl bg-[var(--social-surface-60)] px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--social-accent-soft)] text-xs font-semibold text-[var(--social-accent)]">
                                      {m.username.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span className="text-sm">{m.username}</span>
                                    <span className="text-[11px] text-[var(--social-faint)]">{ROLE_LABEL[m.role]}</span>
                                  </div>
                                  {s.myRole === 'OWNER' && m.role !== 'OWNER' && (
                                    <button
                                      type="button"
                                      onClick={() => removeMember(s.id, m.username)}
                                      aria-label={`移除 ${m.username}`}
                                      className="rounded-full p-1 text-[var(--social-faint)] transition hover:text-[#E06C6C]"
                                    >
                                      <UserMinus className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {(members[s.id] || []).length === 0 && <p className="py-2 text-center text-xs text-[var(--social-faint)]">暂无成员</p>}
                            </div>
                          </div>

                          {/* 邀请码（仅 OWNER 显示生成与撤销） */}
                          {s.myRole === 'OWNER' && (
                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-medium uppercase tracking-wider text-[var(--social-faint)]">邀请码</p>
                                <button
                                  type="button"
                                  onClick={() => generateInvite(s.id)}
                                  className="inline-flex items-center gap-1 rounded-full bg-[var(--social-accent)] px-3 py-1 text-xs font-medium text-[var(--social-on-accent)] transition hover:bg-[var(--social-accent-strong)]"
                                >
                                  <Plus className="h-3 w-3" />生成邀请码
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                {(invites[s.id] || []).filter((i) => i.status === 'PENDING').map((inv) => (
                                  <div key={inv.id} className="flex items-center justify-between rounded-xl bg-[var(--social-surface-60)] px-3 py-2">
                                    <code className="font-mono text-sm tracking-widest">{inv.code || '••••-••••'}</code>
                                    <div className="flex items-center gap-1">
                                      {inv.code && (
                                        <button
                                          type="button"
                                          onClick={() => copyCode(s.id, inv.code!)}
                                          aria-label="复制邀请码"
                                          className="rounded-full p-1.5 text-[var(--social-faint)] transition hover:text-[var(--social-accent)]"
                                        >
                                          {copied[s.id] ? <Sparkles className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => revokeInvite(s.id, inv.id)}
                                        aria-label="撤销邀请码"
                                        className="rounded-full p-1.5 text-[var(--social-faint)] transition hover:text-[#E06C6C]"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {(invites[s.id] || []).filter((i) => i.status === 'PENDING').length === 0 && (
                                  <p className="py-1 text-center text-xs text-[var(--social-faint)]">暂无有效邀请码</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6 py-2">
              <div className="text-center">
                <p className="text-sm text-[var(--social-text)]">还没有空间</p>
                <p className="mt-1 text-xs text-[var(--social-muted)]">创建一个属于你们的空间，把旅行、相册和回忆放进来一起记录</p>
              </div>

              {/* 创建空间 */}
              <div className="rounded-2xl bg-[var(--social-bg)] p-4 ring-1 ring-[var(--social-line)]">
                <button
                  type="button"
                  onClick={() => setCreateMode(!createMode)}
                  className="flex w-full items-center justify-between text-sm font-medium"
                >
                  <span className="flex items-center gap-2"><Plus className="h-4 w-4 text-[var(--social-accent)]" />创建空间</span>
                  <span className="text-[var(--social-faint)]">{createMode ? '收起' : '展开'}</span>
                </button>
                {createMode && (
                  <form onSubmit={create} className="mt-3 space-y-3">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="空间名称（如：我们的小家）"
                      className="w-full rounded-xl bg-[var(--social-surface)] px-3.5 py-2.5 text-sm outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--social-accent)]"
                    />
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="简介（可选）"
                      className="w-full resize-none rounded-xl bg-[var(--social-surface)] px-3.5 py-2.5 text-sm outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--social-accent)]"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !name.trim()}
                      className="w-full rounded-full bg-[var(--social-accent)] py-2.5 text-sm font-medium text-[var(--social-on-accent)] transition hover:bg-[var(--social-accent-strong)] disabled:opacity-50"
                    >
                      {submitting ? '创建中...' : '创建空间'}
                    </button>
                  </form>
                )}
              </div>

              {/* 邀请码加入 */}
              <div className="rounded-2xl bg-[var(--social-bg)] p-4 ring-1 ring-[var(--social-line)]">
                <form onSubmit={join} className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4 text-[var(--social-accent)]" />输入邀请码加入</p>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="形如 7XK2-M9PQ"
                    className="w-full rounded-xl bg-[var(--social-surface)] px-3.5 py-2.5 text-center font-mono text-sm tracking-widest uppercase outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--social-accent)]"
                  />
                  <button
                    type="submit"
                    disabled={joining || !joinCode.trim()}
                    className="w-full rounded-full bg-[var(--social-surface)] py-2.5 text-sm font-medium ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-accent)] disabled:opacity-50"
                  >
                    {joining ? '加入中...' : '加入空间'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-center text-sm text-[#E06C6C]">{error}</p>}
          {message && (
            <p className={`mt-4 flex items-center justify-center gap-1.5 text-center text-xs ${message.type === 'ok' ? 'text-emerald-500' : 'text-[#E06C6C]'}`}>
              <Sparkles className="h-3 w-3" />
              {message.text}
            </p>
          )}
        </div>

        <div className="border-t border-[var(--social-line)] px-5 py-3">
          <button
            type="button"
            onClick={() => { setError(''); load() }}
            className="flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs text-[var(--social-faint)] transition hover:text-[var(--social-accent)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </div>
      </div>
    </div>
  )
}
