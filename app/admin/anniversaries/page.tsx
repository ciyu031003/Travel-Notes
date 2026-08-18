'use client'

import Link from 'next/link'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Loader2, AlertCircle, CalendarDays } from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'

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

      <form onSubmit={handleCreate} className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-travel-accentSoft" />
          新增纪念日
        </h2>
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
              placeholder="例如：第一次见面"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
            <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="rounded" />
              每年重复（周年纪念）
            </label>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">备注</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
            placeholder="备注（可选）"
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
          className="px-5 py-2.5 bg-travel-accent hover:bg-travel-accentStrong disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {creating && <Loader2 className="w-4 h-4 animate-spin" />}
          添加纪念日
        </button>
      </form>

      {loading ? (
        <div className="text-center py-16 text-gray-500">加载中...</div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">还没有纪念日</div>
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
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        item.recurring
                          ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-500'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                      }`}
                    >
                      {item.recurring ? '周年纪念' : '单次'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {new Date(item.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    {item.description ? ` · ${item.description}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleRecurring(item)}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {item.recurring ? '设为单次' : '设为周年'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </AdminShell>
  )
}


