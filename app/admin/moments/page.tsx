'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Trash2, Send, Home, Settings, LogOut, Code2, Loader2, Inbox } from 'lucide-react'

interface MomentItem {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
}

interface MomentsResponse {
  data?: {
    data?: MomentItem[]
    total?: number
    hasMore?: boolean
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminMomentsPage() {
  const router = useRouter()
  const [moments, setMoments] = useState<MomentItem[]>([])
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fetchMoments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/moments?page=1&pageSize=100')
      if (res.status === 401) {
        router.push('/admin/login')
        return
      }
      if (res.ok) {
        const json: MomentsResponse = await res.json()
        setMoments(json.data?.data || [])
        setTotal(json.data?.total || 0)
      }
    } catch {}
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetchMoments()
  }, [fetchMoments])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setMessage(null)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const res = await fetch('/api/admin/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, tags }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'err', text: json.error || '发布失败' })
        return
      }
      setContent('')
      setTagsInput('')
      setMessage({ type: 'ok', text: '发布成功' })
      fetchMoments()
    } catch {
      setMessage({ type: 'err', text: '发布失败，请重试' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这条碎碎念吗？')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/moments/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchMoments()
      } else {
        setMessage({ type: 'err', text: '删除失败' })
      }
    } catch {
      setMessage({ type: 'err', text: '删除失败' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-r from-rose-400 to-pink-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">碎碎念管理</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin" className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Home className="w-4 h-4" />
                文章管理
              </Link>
              <Link href="/admin/repos" className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                <Code2 className="w-4 h-4" />
                代码仓库管理
              </Link>
              <Link href="/admin/settings" className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Settings className="w-4 h-4" />
                账号设置
              </Link>
              <button
                onClick={async () => {
                  await fetch('/api/admin/logout', { method: 'POST' })
                  router.push('/admin/login')
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${message.type === 'ok' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-400" />
            发布一条碎碎念
          </h2>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="记录此刻的想法、灵感或小确幸..."
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
          />
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="标签（用逗号分隔，可选）"
              className="flex-1 min-w-[180px] px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-rose-400 to-pink-500 hover:from-rose-500 hover:to-pink-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              发布
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">{content.length}/2000</p>
        </form>

        <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          共 {total} 条碎碎念
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
            加载中...
          </div>
        ) : moments.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Inbox className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>还没有碎碎念，发布第一条吧~</p>
          </div>
        ) : (
          <div className="space-y-3">
            {moments.map((moment) => (
              <div key={moment.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {moment.content}
                  </p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-xs text-gray-400">{formatTime(moment.createdAt)}</span>
                    {moment.tags && moment.tags.length > 0 && (
                      <span className="flex gap-1.5 flex-wrap">
                        {moment.tags.map((tag) => (
                          <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-300">
                            #{tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(moment.id)}
                  disabled={deletingId === moment.id}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
