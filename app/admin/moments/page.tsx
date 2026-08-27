'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Trash2, Send, Loader2, Inbox } from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'
import { AdminInput, AdminTextarea, AdminButton, AdminCard } from '@/components/admin/ui'

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
    <AdminShell title="碎碎念管理">


      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${message.type === 'ok' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-8">
          <AdminCard title="发布一条碎碎念" icon={Sparkles}>
            <AdminTextarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="记录此刻的想法、灵感或小确幸..."
            />
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <AdminInput
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="标签（用逗号分隔，可选）"
                className="flex-1 min-w-[180px]"
              />
              <AdminButton
                type="submit"
                disabled={submitting || !content.trim()}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                发布
              </AdminButton>
            </div>
            <p className="mt-2 text-xs text-travel-ink/50 dark:text-gray-400">{content.length}/2000</p>
          </AdminCard>
        </form>

        <div className="mb-4 text-sm text-travel-ink/60 dark:text-gray-400">
          共 {total} 条碎碎念
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-travel-ink/50 dark:text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            加载中...
          </div>
        ) : moments.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-travel-bloom/50 bg-white/50 p-14 text-center dark:border-shell-line dark:bg-white/5">
            <Inbox className="mx-auto mb-4 h-12 w-12 opacity-30 text-travel-accentSoft" />
            <p className="text-travel-ink/70 dark:text-gray-400">还没有碎碎念，发布第一条吧~</p>
          </div>
        ) : (
          <div className="space-y-3">
            {moments.map((moment) => (
              <div key={moment.id} className="rounded-2xl border border-travel-line/50 bg-white/80 p-5 shadow-soft dark:border-shell-line dark:bg-shell-bg/80 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-travel-ink dark:text-gray-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {moment.content}
                  </p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-xs text-travel-ink/50 dark:text-gray-400">{formatTime(moment.createdAt)}</span>
                    {moment.tags && moment.tags.length > 0 && (
                      <span className="flex gap-1.5 flex-wrap">
                        {moment.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-travel-sakura/50 dark:bg-travel-accent/15 text-travel-accent dark:text-travel-accentSoft">
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
                  className="p-2 rounded-lg text-travel-ink/50 hover:text-travel-danger hover:bg-travel-danger/10 transition-colors disabled:opacity-50"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </AdminShell>
  )
}


