'use client'

import { useEffect, useState, useCallback } from 'react'
import { Send, X, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommentAuthor { id: number; username: string }
interface Comment {
  id: number
  userId: number
  parentId: number | null
  content: string
  createdAt: string
  author: CommentAuthor | null
  likeCount: number
  isLiked: boolean
  replies: Comment[]
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  if (isNaN(d)) return ''
  const diff = Date.now() - d
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  const days = Math.floor(h / 24)
  if (days < 30) return days + ' 天前'
  return new Date(iso).toLocaleDateString('zh-CN')
}

export default function CommentPanel({ postId, onClose }: { postId: number; onClose?: () => void }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: number; username: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/social/posts/' + postId + '/comments')
      if (res.ok) {
        const json = await res.json()
        setComments(Array.isArray(json.data) ? json.data : [])
      }
    } catch {} finally { setLoading(false) }
  }, [postId])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    const text = content.trim()
    if (!text || submitting) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/social/posts/' + postId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, parentId: replyTo?.id ?? null }),
      })
      if (res.ok) {
        setContent(''); setReplyTo(null); await load()
      } else {
        const json = await res.json().catch(() => null)
        setError(json?.error || '评论失败')
      }
    } catch { setError('网络错误') } finally { setSubmitting(false) }
  }

  const total = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0)

  const renderComment = (c: Comment, isReply: boolean) => (
    <div key={c.id} className={cn('group py-3', isReply && 'ml-9 border-l border-white/10 pl-3')}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-album-accent/20 text-xs font-medium text-album-accent">
          {(c.author?.username || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-album-text1">{c.author?.username || '匿名'}</span>
            <span className="text-[11px] text-album-text3">{timeAgo(c.createdAt)}</span>
          </div>
          <p className="mt-1 break-words text-sm text-album-text1/90">{c.content}</p>
          <button
            type="button"
            onClick={() => setReplyTo({ id: c.id, username: c.author?.username || '' })}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-album-text3 hover:text-album-accent"
          >
            <CornerDownRight className="h-3 w-3" /> 回复
          </button>
        </div>
      </div>
      {c.replies?.length > 0 && c.replies.map((r) => renderComment(r, true))}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[78vh] max-w-2xl flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-album-bg1">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-album-text1">评论 {total > 0 ? '(' + total + ')' : ''}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-album-text2 hover:bg-white/10 hover:text-album-text1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {loading ? (
            <p className="py-10 text-center text-sm text-album-text3">加载中…</p>
          ) : comments.length === 0 ? (
            <p className="py-10 text-center text-sm text-album-text3">还没有评论，来抢沙发～</p>
          ) : (
            comments.map((c) => renderComment(c, false))
          )}
        </div>

        <div className="border-t border-white/10 bg-album-bg2 px-4 py-3">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 text-xs text-album-text2">
              <span>回复 @{replyTo.username}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-album-text3 hover:text-album-text1">取消</button>
            </div>
          )}
          {error && <p className="mb-2 text-xs text-album-error">{error}</p>}
          <div className="flex items-center gap-2">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              placeholder={replyTo ? '回复 ' + replyTo.username + '…' : '写下你的评论…'}
              className="h-10 min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-album-text1 placeholder:text-album-text3 focus:border-album-accent/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !content.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-album-accent text-album-bg0 transition active:scale-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
