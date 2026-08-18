'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Plus, Users, Loader2, AlertCircle, Copy, Check, Link2, X,
  Heart, Images, MapPin, Sparkles, Camera, Trash2, UserPlus, Gift, Shield,
  Clock, Ban, ChevronRight, Eye,
} from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'

interface Space {
  id: number
  name: string
  slug: string
  description: string | null
  memberCount: number
  myRole: string
  albumCount?: number
  travelCount?: number
  memoryCount?: number
  mediaCount?: number
}

interface Member {
  id: number
  username: string
  role: string
  status: string
  joinedAt: string
}

interface Invite {
  id: number
  role: string
  code?: string
  expiresAt: string
  createdBy: string
  usedAt: string | null
  createdAt: string
  status: 'PENDING' | 'USED' | 'EXPIRED'
}

const ROLE_LABEL: Record<string, string> = { OWNER: '创建者', MEMBER: '伴侣成员', VIEWER: '访客' }
const ROLE_COLOR: Record<string, string> = {
  OWNER: 'bg-travel-sakura dark:bg-travel-accentStrong/40 text-travel-accentStrong dark:text-travel-accentSoft',
  MEMBER: 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300',
  VIEWER: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300',
}

const SPACE_GRADIENTS = [
  'from-travel-accentSoft via-pink-500 to-orange-300',
  'from-sky-400 via-indigo-500 to-purple-400',
  'from-emerald-400 via-teal-500 to-cyan-400',
  'from-amber-400 via-orange-500 to-travel-accentSoft',
]

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

export default function AdminSpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // 创建空间
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  // 加入空间
  const [showJoin, setShowJoin] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)

  // 成员
  const [memberSpaceId, setMemberSpaceId] = useState<number | null>(null)
  const [members, setMembers] = useState<Record<number, Member[]>>({})
  const [membersLoading, setMembersLoading] = useState(false)

  // 邀请
  const [inviteSpaceId, setInviteSpaceId] = useState<number | null>(null)
  const [invites, setInvites] = useState<Record<number, Invite[]>>({})
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviteDays, setInviteDays] = useState(7)
  const [generatedCode, setGeneratedCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  // 邀请记录中的邀请码查看/复制
  const [revealedInviteId, setRevealedInviteId] = useState<number | null>(null)
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2500)
  }

  const fetchSpaces = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/spaces')
      if (res.ok) {
        const data = await res.json()
        setSpaces(data.spaces || [])
      } else {
        setError('加载失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSpaces()
  }, [fetchSpaces])

  // URL 带入邀请码（分享链接直达）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('join')
    if (invite) {
      setJoinCode(invite.toUpperCase())
      setShowJoin(true)
    }
  }, [])

  const fetchMembers = async (spaceId: number) => {
    setMemberSpaceId(spaceId)
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/spaces/${spaceId}/members`)
      if (res.ok) {
        const data = await res.json()
        setMembers((prev) => ({ ...prev, [spaceId]: data.members || [] }))
      }
    } catch {}
    setMembersLoading(false)
  }

  const fetchInvites = async (spaceId: number) => {
    setInviteSpaceId(spaceId)
    try {
      const res = await fetch(`/api/spaces/${spaceId}/invites`)
      if (res.ok) {
        const data = await res.json()
        setInvites((prev) => ({ ...prev, [spaceId]: data.invites || [] }))
      }
    } catch {}
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, description }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '创建失败')
        return
      }
      setName(''); setSlug(''); setDescription('')
      setShowCreate(false)
      showToast('空间创建成功 🎉')
      await fetchSpaces()
    } catch {
      setError('网络错误')
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setJoining(true)
    try {
      const res = await fetch('/api/spaces/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '加入失败')
        return
      }
      setShowJoin(false)
      setJoinCode('')
      showToast(`已加入「${data.spaceName}」${data.role === 'MEMBER' ? '，从此一起记录' : ''}`)
      await fetchSpaces()
    } catch {
      setError('网络错误')
    } finally {
      setJoining(false)
    }
  }

  const handleGenerateInvite = async (spaceId: number) => {
    setError('')
    setInviteLoading(true)
    try {
      const res = await fetch(`/api/spaces/${spaceId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole, expiresInDays: inviteDays }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '生成失败')
        return
      }
      setGeneratedCode(data.code || '')
      await fetchInvites(spaceId)
    } catch {
      setError('网络错误')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRevokeInvite = async (spaceId: number, inviteId: number) => {
    try {
      await fetch(`/api/spaces/${spaceId}/invites/${inviteId}`, { method: 'DELETE' })
      await fetchInvites(spaceId)
      showToast('邀请已撤销')
    } catch {}
  }

  const handleRemoveMember = async (spaceId: number, username: string) => {
    if (!window.confirm(`确定将「${username}」移出空间吗？`)) return
    try {
      const res = await fetch(`/api/spaces/${spaceId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (res.ok) {
        await fetchMembers(spaceId)
        await fetchSpaces()
        showToast('成员已移除')
      }
    } catch {}
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  /** 点击眼睛图标：自动显示并复制邀请码 */
  const handleRevealAndCopy = async (inv: Invite) => {
    if (!inv.code) return
    setRevealedInviteId(inv.id)
    try {
      await navigator.clipboard.writeText(inv.code)
      setCopiedInviteId(inv.id)
      showToast('邀请码已复制')
      window.setTimeout(() => setCopiedInviteId((cur) => (cur === inv.id ? null : cur)), 2000)
    } catch {
      showToast('复制失败，请手动复制')
    }
  }

  const inviteUrl = (code: string) => `${window.location.origin}/admin/spaces?join=${code}`

  const inputCls =
    'w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/70 focus:border-transparent transition-all placeholder-gray-400 dark:placeholder-gray-500'

  return (
    <AdminShell title="空间管理">
      {/* 顶部 */}
      <div className="mx-auto max-w-5xl px-1 py-2">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-travel-accent via-pink-500 to-orange-400 p-7 sm:p-9 text-white shadow-xl shadow-travel-accent/20">
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute right-16 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              <Heart className="w-3.5 h-3.5" />
              两个人的数字小家
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold">空间管理</h1>
            <p className="mt-2 text-sm text-white/85 max-w-xl leading-relaxed">
              创建属于你们的空间，邀请伴侣加入，一起查看相册、旅行与回忆。
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => { setShowCreate(true); setError('') }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-travel-accentStrong shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                创建空间
              </button>
              <button
                type="button"
                onClick={() => { setShowJoin(true); setError('') }}
                className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/25 hover:-translate-y-0.5 active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                加入空间
              </button>
            </div>
          </div>
        </div>

        {/* 空间列表 */}
        <div className="mt-8">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              加载中...
            </div>
          ) : spaces.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-travel-sakura dark:border-travel-accent/40/60 bg-white/60 dark:bg-gray-900/40 p-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-travel-sakura to-pink-100 dark:from-travel-accentStrong/30 dark:to-pink-900/30">
                <Heart className="w-8 h-8 text-travel-accentSoft" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">还没有空间</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                创建第一个空间，邀请你的伴侣一起开始记录
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-travel-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-travel-accent/25 transition-all hover:bg-travel-accentStrong hover:-translate-y-0.5 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                创建空间
              </button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {spaces.map((space, idx) => {
                const gradient = SPACE_GRADIENTS[idx % SPACE_GRADIENTS.length]
                const isOwner = space.myRole === 'OWNER'
                const spaceMembers = members[space.id] || []
                return (
                  <div
                    key={space.id}
                    className="group overflow-hidden rounded-3xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1"
                  >
                    {/* 封面 */}
                    <div className={`relative h-24 bg-gradient-to-br ${gradient} p-4`}>
                      <div className="absolute right-4 top-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur ${
                          isOwner ? 'bg-white/90 text-travel-accentStrong' : 'bg-black/20 text-white'
                        }`}>
                          <Shield className="w-3 h-3" />
                          {ROLE_LABEL[space.myRole] || space.myRole}
                        </span>
                      </div>
                      <h3 className="relative text-xl font-bold text-white drop-shadow">
                        {space.name}
                      </h3>
                      <p className="relative text-xs text-white/80 mt-0.5">/{space.slug}</p>
                    </div>

                    <div className="p-5">
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2.5rem]">
                        {space.description || '还没有简介，写一句话介绍你们的小家吧'}
                      </p>

                      {/* 共享内容统计 */}
                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <div className="flex flex-col items-center gap-1 rounded-2xl bg-travel-sakura/50 dark:bg-travel-accentStrong/15 py-2.5">
                          <Images className="w-4 h-4 text-travel-accent" />
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{space.albumCount ?? 0}</span>
                          <span className="text-[10px] text-gray-400">相册</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 rounded-2xl bg-sky-50 dark:bg-sky-900/15 py-2.5">
                          <MapPin className="w-4 h-4 text-sky-500" />
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{space.travelCount ?? 0}</span>
                          <span className="text-[10px] text-gray-400">旅行</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 rounded-2xl bg-purple-50 dark:bg-purple-900/15 py-2.5">
                          <Sparkles className="w-4 h-4 text-purple-500" />
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{space.memoryCount ?? 0}</span>
                          <span className="text-[10px] text-gray-400">回忆</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 rounded-2xl bg-amber-50 dark:bg-amber-900/15 py-2.5">
                          <Camera className="w-4 h-4 text-amber-500" />
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{space.mediaCount ?? 0}</span>
                          <span className="text-[10px] text-gray-400">照片</span>
                        </div>
                      </div>

                      {/* 成员 */}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center -space-x-2">
                          {spaceMembers.length > 0 ? (
                            spaceMembers.slice(0, 4).map((m) => (
                              <div
                                key={m.id}
                                title={`${m.username} · ${ROLE_LABEL[m.role] || m.role}`}
                                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white dark:border-gray-900 bg-gradient-to-br from-travel-accentSoft to-pink-400 text-xs font-bold text-white shadow"
                              >
                                {(m.username || '?').slice(0, 1).toUpperCase()}
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">加载成员...</span>
                          )}
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            {space.memberCount} 位成员
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => fetchMembers(space.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-travel-accent dark:hover:text-travel-accentSoft transition-colors"
                        >
                          管理
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 操作 */}
                      <div className="mt-4 flex gap-2">
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              setGeneratedCode('')
                              fetchInvites(space.id)
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-travel-accent px-3 py-2.5 text-sm font-medium text-white shadow-md shadow-travel-accent/20 transition-all hover:bg-travel-accentStrong active:scale-95"
                          >
                            <Gift className="w-4 h-4" />
                            邀请伴侣
                          </button>
                        )}
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`确定删除空间「${space.name}」吗？此操作不可恢复`)) {
                                fetch(`/api/spaces/${space.id}`, { method: 'DELETE' }).then(() => {
                                  showToast('空间已删除')
                                  fetchSpaces()
                                })
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 transition-all hover:border-red-300 hover:text-red-500 active:scale-95"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ============ 创建空间弹窗 ============ */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="创建空间" icon={<Heart className="w-5 h-5 text-travel-accent" />}>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <ErrorBox message={error} />}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">空间名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="例如：我们的小家" required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">空间标识</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className={inputCls} placeholder="例如：our-love (小写字母/数字/连字符)" required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">简介（可选）</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="一句话介绍你们的空间" />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-travel-accent py-3 text-sm font-semibold text-white shadow-lg shadow-travel-accent/25 transition-all hover:bg-travel-accentStrong active:scale-[0.98] disabled:opacity-50"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              创建
            </button>
          </form>
        </Modal>
      )}

      {/* ============ 加入空间弹窗 ============ */}
      {showJoin && (
        <Modal onClose={() => setShowJoin(false)} title="加入空间" icon={<UserPlus className="w-5 h-5 text-sky-500" />}>
          <form onSubmit={handleJoin} className="space-y-4">
            {error && <ErrorBox message={error} />}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">邀请码</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className={`${inputCls} text-center text-lg font-bold tracking-[0.3em] uppercase`}
                placeholder="XXXX-XXXX"
                required
              />
              <p className="mt-2 text-xs text-gray-400">输入伴侣分享给你的邀请码（8 位，如 7XK2-M9PQ）</p>
            </div>
            <button
              type="submit"
              disabled={joining}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:bg-sky-600 active:scale-[0.98] disabled:opacity-50"
            >
              {joining && <Loader2 className="w-4 h-4 animate-spin" />}
              加入空间
            </button>
          </form>
        </Modal>
      )}

      {/* ============ 成员管理弹窗 ============ */}
      {memberSpaceId !== null && (
        <Modal
          onClose={() => setMemberSpaceId(null)}
          title="成员管理"
          icon={<Users className="w-5 h-5 text-sky-500" />}
          wide
        >
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {membersLoading ? (
              <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (members[memberSpaceId] || []).length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">暂无成员</p>
            ) : (
              (members[memberSpaceId] || []).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-travel-accentSoft to-pink-400 text-sm font-bold text-white">
                      {(m.username || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.username}</p>
                      <p className="text-xs text-gray-400">加入于 {fmtDate(m.joinedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ROLE_COLOR[m.role] || ROLE_COLOR.VIEWER}`}>
                      {ROLE_LABEL[m.role] || m.role}
                    </span>
                    {m.role !== 'OWNER' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(memberSpaceId, m.username)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        title="移除成员"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* ============ 邀请伴侣弹窗 ============ */}
      {inviteSpaceId !== null && (
        <Modal
          onClose={() => setInviteSpaceId(null)}
          title={inviteRole === 'VIEWER' ? '邀请访客' : '邀请伴侣'}
          icon={<Gift className="w-5 h-5 text-travel-accent" />}
          wide
        >
          <div className="space-y-5">
            {error && <ErrorBox message={error} />}

            {/* 生成邀请 */}
            <div className="rounded-2xl bg-gradient-to-br from-travel-sakura to-travel-sakura dark:from-travel-accentStrong/20 dark:to-travel-accentStrong/20 border border-travel-sakura dark:border-travel-accentStrong/50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
                >
                  <option value="MEMBER">伴侣成员（可共同编辑）</option>
                  <option value="VIEWER">访客（仅可查看）</option>
                </select>
                <select
                  value={inviteDays}
                  onChange={(e) => setInviteDays(parseInt(e.target.value, 10))}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
                >
                  <option value={1}>1 天有效</option>
                  <option value={3}>3 天有效</option>
                  <option value={7}>7 天有效</option>
                  <option value={30}>30 天有效</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleGenerateInvite(inviteSpaceId)}
                  disabled={inviteLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-travel-accent px-4 py-2 text-sm font-medium text-white shadow-md shadow-travel-accent/25 transition-all hover:bg-travel-accentStrong active:scale-95 disabled:opacity-50"
                >
                  {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                  生成邀请码
                </button>
              </div>

              {generatedCode && (
                <div className="mt-4 rounded-2xl bg-white dark:bg-gray-900 border border-travel-sakura dark:border-travel-accentStrong/50 p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {inviteRole === 'VIEWER' ? '把下面的邀请码发给访客（仅可查看）' : '把下面的邀请码发给你的伴侣'}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 rounded-xl bg-travel-sakura/50 dark:bg-travel-accent/20 px-4 py-3 text-center text-xl font-bold tracking-[0.35em] text-travel-accentStrong dark:text-travel-accentSoft select-all">
                      {generatedCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(inviteUrl(generatedCode))}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3 text-sm text-gray-600 dark:text-gray-300 transition-all hover:border-travel-accentSoft hover:text-travel-accent active:scale-95"
                      title="复制邀请链接"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      复制链接
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(generatedCode)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3 text-sm text-gray-600 dark:text-gray-300 transition-all hover:border-travel-accentSoft hover:text-travel-accent active:scale-95"
                      title="复制邀请码"
                    >
                      <Link2 className="w-4 h-4" />
                      复制码
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {`${inviteDays} 天内有效，${inviteRole === 'MEMBER' ? '对方加入后为伴侣成员，可共同编辑内容' : '对方加入后为访客，仅可查看'}`}
                  </p>
                </div>
              )}
            </div>

            {/* 邀请记录 */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">邀请记录</h4>
              {(invites[inviteSpaceId] || []).length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">还没有邀请记录</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(invites[inviteSpaceId] || []).map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Gift className="w-4 h-4 text-travel-accentSoft" />
                        <div>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                            邀请 #{inv.id} · {ROLE_LABEL[inv.role] || inv.role}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {inv.status === 'PENDING' && `${daysLeft(inv.expiresAt)} 天后过期`}
                            {inv.status === 'USED' && '已使用'}
                            {inv.status === 'EXPIRED' && '已过期'}
                          </p>
                          {revealedInviteId === inv.id && inv.code && (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-travel-sakura/50 dark:bg-travel-accent/20 px-2.5 py-1 text-xs font-bold tracking-[0.25em] text-travel-accentStrong dark:text-travel-accentSoft select-all">
                              {inv.code}
                              {copiedInviteId === inv.id && <Check className="w-3 h-3 text-emerald-500" />}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          inv.status === 'PENDING'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300'
                            : inv.status === 'USED'
                            ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                        }`}>
                          {inv.status === 'PENDING' ? '待使用' : inv.status === 'USED' ? '已使用' : '已过期'}
                        </span>
                        {inv.status === 'PENDING' && inv.code && (
                          <button
                            type="button"
                            onClick={() => handleRevealAndCopy(inv)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-travel-sakura/60 hover:text-travel-accent dark:hover:bg-travel-accentStrong/20"
                            title="查看并复制邀请码"
                          >
                            {revealedInviteId === inv.id && copiedInviteId === inv.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        {inv.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(inviteSpaceId, inv.id)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors"
                            title="撤销邀请"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* 轻提示 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 animate-[fadeIn_0.25s_ease] rounded-full bg-gray-900/90 dark:bg-gray-800/95 px-5 py-2.5 text-sm text-white shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}
    </AdminShell>
  )
}

/* ============ 通用弹窗外壳 ============ */
function Modal({
  children,
  onClose,
  title,
  icon,
  wide,
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
  icon: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-[fadeInUp_0.25s_ease]`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2.5">
            {icon}
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  )
}



