'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Send, X, CornerDownRight } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialAvatar from '@/components/social/SocialAvatar'
import { useCloseOnBack } from '@/hooks/use-close-on-back'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { cn } from '@/lib/utils'
import { createComment } from '@/lib/modules/offline/social-write'
import { apiUrl } from '@/lib/api-base'

interface CommentAuthor { id: number; username: string; nickname?: string | null; avatarUrl?: string | null }
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
  // 面板仅在打开期间挂载（PostDetail 条件渲染）；给了 onClose 就接管系统返回
  useCloseOnBack(Boolean(onClose), onClose ?? (() => {}), Boolean(onClose))
  const [comments, setComments] = useState<Comment[]>([])
  /**
   * 本地待同步评论（2026-10-12）。
   *
   * 原生壳提交评论只写本地队列（createComment → { ok, local: true }），服务端此刻
   * 还没有这条数据。若直接以服务端列表为准，用户会看到"发送成功但评论没出现"。
   * 因此把本地已提交但未同步的评论暂存在这里，渲染时与服务端结果**合并**，
   * 等服务端出现同样内容后自动去重（见 mergedComments）。
   */
  const [pendingComments, setPendingComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: number; username: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // 软键盘避让：面板贴在视口底部，键盘弹出时若不上抬，输入框会被完全遮住。
  const keyboardInset = useKeyboardInset()

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/social/posts/${postId}/comments`), { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setComments(Array.isArray(json.data) ? json.data : [])
      }
    } catch {} finally { setLoading(false) }
  }, [postId])

  useEffect(() => { load() }, [load])

  /**
   * 本地乐观插入一条评论（2026-10-12 新增）。
   *
   * 为什么需要：原生壳（甜途 App）的 createComment **只写入本地队列**并返回
   * `{ ok: true, local: true }`，真正的上传由同步引擎稍后完成。此前提交成功后
   * 直接 `await load()`（从服务端重新拉取），而此刻服务端还没有这条评论 ——
   * 于是用户看到"发送成功但列表里没有"，以为评论丢了（真机反馈的 bug）。
   *
   * 现在：本地先插入（带 pending 标记的临时评论），同时触发一次服务端刷新；
   * 服务端数据回来后会覆盖本地列表，待同步完成后自然一致。
   */
  const insertLocal = (text: string, parentId: number | null) => {
    const optimistic: Comment = {
      id: -Date.now(),          // 负数临时 id，避免与服务端 id 冲突
      userId: -1,
      parentId,
      content: text,
      createdAt: new Date().toISOString(),
      author: { id: -1, username: '我', nickname: '我', avatarUrl: null },
      likeCount: 0,
      isLiked: false,
      replies: [],
    }
    setPendingComments((prev) => [...prev, optimistic])
  }

  /**
   * 合并服务端结果与本地待同步评论；服务端已出现相同内容时丢弃本地副本（去重）。
   * 以「内容 + 父评论」为键：同一条评论同步成功后服务端版本接管，用户无感。
   */
  const mergedComments = useMemo<Comment[]>(() => {
    if (pendingComments.length === 0) return comments
    const serverContents = new Set<string>()
    const collect = (list: Comment[]) => {
      for (const c of list) {
        serverContents.add((c.parentId ?? 'root') + '|' + c.content)
        if (c.replies?.length) collect(c.replies)
      }
    }
    collect(comments)

    const stillPending = pendingComments.filter(
      (p) => !serverContents.has((p.parentId ?? 'root') + '|' + p.content),
    )
    if (stillPending.length === 0) return comments

    const roots = stillPending.filter((p) => p.parentId == null)
    const replies = stillPending.filter((p) => p.parentId != null)
    return [
      ...comments.map((c) =>
        replies.some((r) => r.parentId === c.id)
          ? { ...c, replies: [...(c.replies || []), ...replies.filter((r) => r.parentId === c.id)] }
          : c,
      ),
      ...roots,
    ]
  }, [comments, pendingComments])

  const submit = async () => {
    const text = content.trim()
    if (!text || submitting) return
    if (replyTo) {
      // 回复暂不走离线队列（D2 仅一级评论离线写），直接在线提交
      setSubmitting(true); setError('')
      try {
        const res = await fetch(apiUrl(`/api/social/posts/${postId}/comments`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text, parentId: replyTo.id }),
        })
        if (res.ok) {
          const parentId = replyTo.id
          setContent(''); setReplyTo(null)
          insertLocal(text, parentId)
          await load()
        }
        else { const json = await res.json().catch(() => null); setError(json?.error || '评论失败') }
      } catch { setError('网络错误') } finally { setSubmitting(false) }
      return
    }
    setSubmitting(true); setError('')
    const r = await createComment(postId, text)
    if (r.ok) {
      setContent('')
      // 先本地可见（原生壳此刻只在本地队列里），再拉服务端覆盖
      insertLocal(text, null)
      await load()
    } else setError(r.error || '评论失败')
    setSubmitting(false)
  }

  // 计数与列表都走合并结果，保证"刚发出去那条"也算进去
  const total = mergedComments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0)

  const renderComment = (c: Comment, isReply: boolean) => {
    const name = c.author?.nickname || c.author?.username || '匿名'
    return (
      <div key={c.id} className={cn('py-4', isReply && 'ml-10 border-l border-[var(--social-line)] pl-3')}>
        <div className="flex items-start gap-2.5">
          <SocialAvatar name={name} avatarUrl={c.author?.avatarUrl} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-[var(--social-text)]">{name}</span>
              <span className="text-xs text-[var(--social-faint)]">{timeAgo(c.createdAt)}</span>
            </div>
            <p className="mt-1 break-words text-sm leading-relaxed text-[var(--social-muted)]">{c.content}</p>
            <button type="button" onClick={() => setReplyTo({ id: c.id, username: name })}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--social-faint)] transition hover:text-[var(--social-accent)]">
              <Icon icon={CornerDownRight} size="sm" /> 回复
            </button>
          </div>
        </div>
        {c.replies?.length > 0 && c.replies.map((r) => renderComment(r, true))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        /* 半屏高度：此前只有 max-h 没有 h，内容少时面板会缩成很小一条
           （真机反馈「评论抽屉太小」）。改为固定约半屏 62dvh，内容多了内部滚动。
           用 dvh 而非 vh：地址栏收放时不跳。 */
        className="absolute inset-x-0 bottom-0 mx-auto flex h-[62dvh] max-w-2xl flex-col overflow-hidden rounded-t-[1.8rem] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)] transition-[bottom] duration-200 ease-out"
        // 键盘弹出时整块上抬 keyboardInset 像素（键盘收起时 insets 为 0，样式不生效）
        style={keyboardInset ? { bottom: keyboardInset } : undefined}
      >
        <div className="flex items-center justify-between border-b border-[var(--social-line)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--social-text)]">评论 {total > 0 ? '(' + total + ')' : ''}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-[var(--social-muted)] hover:text-[var(--social-text)]"><Icon icon={X} size="sm" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {loading ? (
            <p className="py-10 text-center text-sm text-[var(--social-faint)]">加载中…</p>
          ) : mergedComments.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--social-faint)]">还没有评论，来写下第一个旅行故事回应～</p>
          ) : (
            mergedComments.map((c) => renderComment(c, false))
          )}
        </div>

        <div className="border-t border-[var(--social-line)] bg-[var(--social-bg)] px-5 py-3">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 text-xs text-[var(--social-muted)]">
              <span>回复 @{replyTo.username}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-[var(--social-faint)] hover:text-[var(--social-text)]">取消</button>
            </div>
          )}
          {error && <p className="mb-2 text-xs text-[var(--danger-soft)]">{error}</p>}
          <div className="flex items-center gap-2">
            <input value={content} onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              placeholder={replyTo ? '回复 ' + replyTo.username + '…' : '写下你的评论…'}
              className="h-11 min-w-0 flex-1 rounded-full bg-[var(--social-bg)] px-4 text-[16px] text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] placeholder:text-[var(--social-faint)] focus-visible:ring-[var(--social-accent)]" />
            <button type="button" onClick={submit} disabled={submitting || !content.trim()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--social-accent)] text-[var(--social-on-accent)] transition active:scale-90 disabled:opacity-40">
              <Icon icon={Send} size="sm" tone="inverse" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
