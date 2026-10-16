'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Send, X, CornerDownRight, Heart, Trash2, Copy, Share2 } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialAvatar from '@/components/social/SocialAvatar'
import { useCloseOnBack } from '@/hooks/use-close-on-back'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { cn } from '@/lib/utils'
import { createComment } from '@/lib/modules/offline/social-write'
import { apiUrl } from '@/lib/api-base'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { SkeletonRows } from '@/components/mobile/SkeletonList'
import { hapticLight, hapticSuccess } from '@/lib/mobile/haptics'
import { toast } from '@/lib/mobile/toast-store'

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
  /** 服务端判定是否本人所写（决定要不要给删除入口） */
  isMine?: boolean
  replies: Comment[]
}

/**
 * 评论的会话内缓存（2026-10-15）。
 * 面板是"点开才挂载"的，每次都要等一次网络往返，真机反馈"要加载比较久"。
 * 这里按 postId 记住上次结果：打开瞬间先用缓存渲染，同时后台再拉最新。
 * 只存内存、只留最近若干条帖子，不落盘。
 */
const commentsCache = new Map<number, Comment[]>()
const COMMENTS_CACHE_MAX = 20

function readCommentsCache(postId: number): Comment[] | null {
  return commentsCache.get(postId) ?? null
}

function writeCommentsCache(postId: number, list: Comment[]) {
  commentsCache.delete(postId)
  commentsCache.set(postId, list)
  while (commentsCache.size > COMMENTS_CACHE_MAX) {
    const oldest = commentsCache.keys().next().value
    if (oldest === undefined) break
    commentsCache.delete(oldest)
  }
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

export default function CommentPanel({
  postId,
  onClose,
  onCountChange,
}: {
  postId: number
  onClose?: () => void
  /** 删除 / 新增评论时把数量变化告诉父级（详情页的评论数要立即跟着变） */
  onCountChange?: (delta: number) => void
}) {
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
        const list = Array.isArray(json.data) ? json.data : []
        setComments(list)
        writeCommentsCache(postId, list)
      }
    } catch {} finally { setLoading(false) }
  }, [postId])

  useEffect(() => {
    // 先用缓存立即出内容（有缓存就不再显示"加载中"）
    const cached = readCommentsCache(postId)
    if (cached) { setComments(cached); setLoading(false) } else { setLoading(true) }
    // 无论有无缓存都再拉一次最新（stale-while-revalidate）
    void load()
  }, [load, postId])

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
      isMine: true, // 本地乐观插入的必然是本人所写 → 立刻可删
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
          onCountChange?.(1)
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
      onCountChange?.(1)
      await load()
    } else setError(r.error || '评论失败')
    setSubmitting(false)
  }

  /* ── 评论操作（长按 / 更多 / 删除）2026-10-15 ───────────────────────── */

  /** 长按目标；非空即显示操作抽屉 */
  const [actionTarget, setActionTarget] = useState<{ id: number; content: string; name: string; mine: boolean } | null>(null)
  /** 自绘删除确认（替代安卓原生 confirm —— 原生弹窗与全站设计语言割裂） */
  const [confirmDelete, setConfirmDelete] = useState<{ id: number } | null>(null)
  const longPressTimer = useRef<number | null>(null)

  const openActions = useCallback((c: Comment, name: string) => {
    setActionTarget({ id: c.id, content: c.content, name, mine: Boolean(c.isMine) })
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  /** 长按 480ms 弹出操作抽屉；一旦移动（用户在滚动）就取消，避免误触 */
  const startLongPress = useCallback((c: Comment, name: string) => {
    cancelLongPress()
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      void hapticLight()
      openActions(c, name)
    }, 480)
  }, [cancelLongPress, openActions])

  useEffect(() => cancelLongPress, [cancelLongPress])

  /**
   * 删除评论（2026-10-16 重做）。
   *
   * 两个真机反馈：①确认框是安卓系统原生的 alert，和全站设计语言完全割裂；
   * ②删完数量不变（原先等 load() 回来才刷新，网络慢时看着像没生效）。
   * 现在：用自绘确认弹窗，并在确认后**先从本地列表移除**（数量立刻变化），
   * 再发请求；失败则回滚并提示。
   */
  const removeComment = useCallback(async (id: number) => {
    setConfirmDelete(null)
    setActionTarget(null)
    // 记录原位置，失败时原样放回
    const snapshot = comments
    const drop = (list: Comment[]): Comment[] =>
      list
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, replies: (c.replies ?? []).filter((r) => r.id !== id) }))
    setComments(drop(snapshot))
    setPendingComments((prev) => prev.filter((c) => c.id !== id))
    onCountChange?.(-1)
    try {
      const res = await fetch(apiUrl(`/api/social/comments/${id}`), { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        void hapticSuccess()
        toast.success('已删除')
        // 后台对齐一次服务端真值（不阻塞 UI）
        void load()
        return
      }
      const j = await res.json().catch(() => null)
      setComments(snapshot)
      onCountChange?.(1)
      toast.error(j?.error || '删除失败')
    } catch {
      setComments(snapshot)
      onCountChange?.(1)
      toast.error('网络错误，请稍后重试')
    }
  }, [comments, load, onCountChange])

  const copyComment = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制评论内容')
    } catch {
      toast.error('复制失败，请长按正文手动复制')
    }
    setActionTarget(null)
  }, [])

  const shareComment = useCallback(async (text: string) => {
    setActionTarget(null)
    // 原生分享优先（Capacitor/现代浏览器）；不支持时退回复制
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }
    if (typeof nav.share === 'function') {
      try { await nav.share({ text }) } catch { /* 用户取消，静默 */ }
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制，可直接粘贴分享')
    } catch {
      toast.error('分享失败')
    }
  }, [])

  // 计数与列表都走合并结果，保证"刚发出去那条"也算进去
  const total = mergedComments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0)

  /**
   * 单条评论（小红书 / 抖音 风格，2026-10-15 重做）
   * 头像在左、昵称+时间在上、正文在下、动作行在底部；自己的评论多一个删除入口。
   * 长按任意评论 → 弹出「分享 / 复制 / 删除」小抽屉（删除仅本人可见）。
   */
  const renderComment = (c: Comment, isReply: boolean) => {
    const name = c.author?.nickname || c.author?.username || '匿名'
    const mine = Boolean(c.isMine)
    return (
      <div key={c.id} className={cn('py-3.5', isReply && 'ml-9 border-l border-[var(--social-line)] pl-3')}>
        <div className="flex items-start gap-3">
          <SocialAvatar name={name} avatarUrl={c.author?.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-[var(--social-text)]">{name}</span>
              {mine && (
                <span className="rounded-full bg-[var(--social-bg)] px-1.5 py-0.5 text-[11px] text-[var(--social-accent)]">我</span>
              )}
              <span className="text-[11px] text-[var(--social-faint)]">{timeAgo(c.createdAt)}</span>
            </div>

            {/* 长按触发操作抽屉；同时保留可见的删除按钮（可发现性比纯长按好） */}
            <p
              className="mt-1 break-words text-sm leading-relaxed text-[var(--social-text)]"
              onContextMenu={(e) => { e.preventDefault(); openActions(c, name) }}
              onTouchStart={() => startLongPress(c, name)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
            >
              {c.content}
            </p>

            <div className="mt-1.5 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setReplyTo({ id: c.id, username: name })}
                className="inline-flex min-h-[32px] items-center gap-1 text-[13px] text-[var(--social-faint)] transition hover:text-[var(--social-accent)]"
              >
                <Icon icon={CornerDownRight} size="sm" /> 回复
              </button>
              <button
                type="button"
                onClick={() => openActions(c, name)}
                aria-label="更多操作"
                className="inline-flex min-h-[32px] items-center gap-1 text-[13px] text-[var(--social-faint)] transition hover:text-[var(--social-accent)]"
              >
                <Icon icon={Heart} size="sm" /> {c.likeCount > 0 ? c.likeCount : ''}
              </button>
              {mine && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ id: c.id })}
                  className="inline-flex min-h-[32px] items-center gap-1 text-[13px] text-[var(--social-faint)] transition hover:text-[var(--danger-soft)]"
                >
                  <Icon icon={Trash2} size="sm" /> 删除
                </button>
              )}
            </div>
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
            // 骨架屏而非「加载中…」空文本：先给出结构，等待感更低且内容回来不跳高度
            <SkeletonRows rows={3} />
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

      {/*
        长按 / 点「更多」弹出的操作抽屉（2026-10-15）
        对齐小红书、抖音的评论操作：分享、复制、删除；删除仅本人可见。
      */}
      <BottomSheet open={actionTarget !== null} onClose={() => setActionTarget(null)} title="评论操作">
        {actionTarget && (
          <div className="space-y-1.5 pb-1">
            <button
              type="button"
              onClick={() => { void shareComment(actionTarget.content) }}
              className="m-pressable flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3.5 text-left"
            >
              <Icon icon={Share2} size="sm" tone="muted" />
              <span className="text-sm text-[var(--social-text)]">分享</span>
            </button>
            <button
              type="button"
              onClick={() => { void copyComment(actionTarget.content) }}
              className="m-pressable flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3.5 text-left"
            >
              <Icon icon={Copy} size="sm" tone="muted" />
              <span className="text-sm text-[var(--social-text)]">复制</span>
            </button>
            {actionTarget.mine && (
              <button
                type="button"
                onClick={() => { setConfirmDelete({ id: actionTarget.id }); setActionTarget(null) }}
                className="m-pressable flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3.5 text-left"
              >
                <Icon icon={Trash2} size="sm" />
                <span className="text-sm text-[var(--danger-soft)]">删除</span>
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/*
        自绘删除确认（2026-10-16）。
        之前用 window.confirm —— 在 App 里是**安卓系统原生的确认框**，样式与全站
        暖陶土设计语言完全割裂（真机反馈「那个页面特别丑」）。这里换成项目自己的弹层。
      */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center px-8" role="alertdialog" aria-modal="true" aria-label="删除评论">
          <div className="absolute inset-0 bg-black/45" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-[300px] overflow-hidden rounded-3xl bg-[var(--social-surface)] p-5 text-center shadow-[var(--m-shadow-lg)]">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--social-bg)] text-[var(--danger-soft)]">
              <Icon icon={Trash2} size="md" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--social-text)]">删除这条评论？</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--social-muted)]">删除后无法恢复</p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="m-pressable min-h-[44px] flex-1 rounded-2xl text-sm font-medium text-[var(--social-muted)] ring-1 ring-[var(--social-line)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void removeComment(confirmDelete.id) }}
                className="m-press min-h-[44px] flex-1 rounded-2xl bg-[var(--danger-soft)] text-sm font-semibold text-white"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
