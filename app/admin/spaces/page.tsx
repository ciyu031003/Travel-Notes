'use client'

import Link from 'next/link'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Users, Loader2, AlertCircle } from 'lucide-react'

interface Space {
  id: number
  name: string
  slug: string
  description: string | null
  memberCount: number
  myRole: string
}

interface Member {
  id: number
  username: string
  role: string
  status: string
  joinedAt: string
}

export default function AdminSpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  const [members, setMembers] = useState<Record<number, Member[]>>({})
  const [addUser, setAddUser] = useState('')
  const [addRole, setAddRole] = useState('MEMBER')
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [memberError, setMemberError] = useState('')

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

  const fetchMembers = async (spaceId: number) => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/members`)
      if (res.ok) {
        const data = await res.json()
        setMembers((prev) => ({ ...prev, [spaceId]: data.members || [] }))
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
      setName('')
      setSlug('')
      setDescription('')
      await fetchSpaces()
    } catch {
      setError('网络错误')
    } finally {
      setCreating(false)
    }
  }

  const handleAddMember = async (spaceId: number) => {
    setMemberError('')
    if (!addUser.trim()) {
      setMemberError('请输入成员用户名')
      return
    }
    setAddingTo(spaceId)
    try {
      const res = await fetch(`/api/spaces/${spaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addUser.trim(), role: addRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMemberError(data.error || '添加失败')
        return
      }
      setAddUser('')
      await fetchMembers(spaceId)
      await fetchSpaces()
    } catch {
      setMemberError('网络错误')
    } finally {
      setAddingTo(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回后台
        </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">空间管理</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          创建情侣共同空间，管理成员与角色（OWNER / MEMBER / VIEWER）
        </p>
      </div>

      {/* 创建空间 */}
      <form onSubmit={handleCreate} className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-rose-400" />
          创建新空间
        </h2>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
              placeholder="例如：我们的小家"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">标识 (slug)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
              placeholder="our-home"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">简介</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
            placeholder="空间简介（可选）"
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={creating}
          className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {creating && <Loader2 className="w-4 h-4 animate-spin" />}
          创建空间
        </button>
      </form>

      {/* 空间列表 */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">加载中...</div>
      ) : spaces.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          还没有空间，创建第一个情侣空间吧
        </div>
      ) : (
        <div className="space-y-4">
          {spaces.map((space) => (
            <div key={space.id} className="card p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {space.name}
                    <span className="ml-2 text-xs font-normal text-gray-400">/{space.slug}</span>
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {space.description || '暂无简介'} · {space.memberCount} 位成员 · 我的角色：{space.myRole}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchMembers(space.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <Users className="w-4 h-4" />
                  成员
                </button>
              </div>

              {(members[space.id] || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {members[space.id].map((m) => (
                    <span
                      key={m.id}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${
                        m.role === 'OWNER'
                          ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300'
                          : m.role === 'MEMBER'
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                      }`}
                    >
                      {m.username} · {m.role}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={addingTo === space.id ? addUser : ''}
                  onChange={(e) => {
                    setAddUser(e.target.value)
                    setAddingTo(space.id)
                  }}
                  placeholder="成员用户名"
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
                <select
                  value={addingTo === space.id ? addRole : 'MEMBER'}
                  onChange={(e) => {
                    setAddRole(e.target.value)
                    setAddingTo(space.id)
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="VIEWER">VIEWER</option>
                  <option value="OWNER">OWNER</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleAddMember(space.id)}
                  disabled={addingTo === space.id}
                  className="px-3 py-1.5 text-sm bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {addingTo === space.id ? '添加中...' : '添加成员'}
                </button>
              </div>
              {memberError && (
                <p className="mt-2 text-xs text-red-500">{memberError}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
