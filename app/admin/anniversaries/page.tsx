'use client'

import Link from 'next/link'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Loader2, AlertCircle, CalendarDays } from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'
import { AdminInput, AdminButton, AdminCard } from '@/components/admin/ui'

interface Anniversary {
  id: number
  title: string
  date: string
  recurring: boolean
  description: string | null
}

export default function AdminAnniversariesPage() {
  const [items, setItems] = useState<Anniversary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [recurring, setRecurring] = useState(true)
  const [description, setDescription] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/anniversaries')
      if (res.ok) {
        const data = await res.json()
        setItems(data.anniversaries || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim() || !date) {
      setError('请填写名称与日期')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/anniversaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), date, recurring, description }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '创建失败')
        return
      }
      setTitle(''); setDate(''); setDescription(''); setRecurring(true)
      await fetchAll()
    } catch {
      setError('网络错误')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该纪念日？')) return
    const res = await fetch(`/api/admin/anniversaries/${id}`, { method: 'DELETE' })
    if (res.ok) await fetchAll()
  }

  const handleToggleRecurring = async (item: Anniversary) => {
    await fetch(`/api/admin/anniversaries/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurring: !item.recurring }),
    })
    await fetchAll()
  }

  return (
    <AdminShell title="纪念日管理">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-travel-accent dark:hover:text-travel-accentSoft transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回后台
        </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">纪念日管理</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          记录第一次见面、第一次旅行、生日等重要日子
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-8">
        <AdminCard title="新增纪念日" icon={Plus}>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-travel-ink dark:text-gray-300 mb-1">名称</label>
              <AdminInput
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：第一次见面"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-travel-ink dark:text-gray-300 mb-1">日期</label>
              <AdminInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-travel-ink dark:text-gray-300 mb-1">类型</label>
              <label className="flex items-center gap-2 px-3 py-2.5 text-sm text-travel-ink dark:text-gray-300">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="rounded" />
                每年重复（周年纪念）
              </label>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-travel-ink dark:text-gray-300 mb-1">备注</label>
            <AdminInput
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="备注（可选）"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-travel-danger/10 dark:bg-red-900/20 text-travel-danger dark:text-red-400 rounded-xl text-sm mb-4">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <AdminButton type="submit" disabled={creating}>
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            添加纪念日
          </AdminButton>
        </AdminCard>
      </form>

      {loading ? (
        <div className="py-16 text-center text-travel-ink/50 dark:text-gray-500">加载中...</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-travel-bloom/50 bg-white/50 p-8 text-center text-travel-ink/60 dark:border-shell-line dark:bg-white/5">还没有纪念日</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="card p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-travel-sakura/50 dark:bg-travel-accent/20 flex items-center justify-center text-travel-accent shrink-0">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-travel-ink dark:text-gray-100">{item.title}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        item.recurring
                          ? 'bg-travel-accent/10 dark:bg-travel-accent/20 text-travel-accent'
                          : 'bg-travel-ink/10 dark:bg-white/5 text-travel-ink/60'
                      }`}
                    >
                      {item.recurring ? '周年纪念' : '单次'}
                    </span>
                  </div>
                  <p className="text-sm text-travel-ink/60 dark:text-gray-400 mt-0.5">
                    {new Date(item.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    {item.description ? ` · ${item.description}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AdminButton variant="ghost" type="button" onClick={() => handleToggleRecurring(item)}>
                  {item.recurring ? '设为单次' : '设为周年'}
                </AdminButton>
                <AdminButton variant="danger" type="button" onClick={() => handleDelete(item.id)} className="!p-2">
                  <Trash2 className="w-4 h-4" />
                </AdminButton>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </AdminShell>
  )
}


