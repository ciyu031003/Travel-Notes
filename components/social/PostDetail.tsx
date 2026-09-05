'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, MapPin, CalendarDays, Loader2, Image as ImageIcon, Flag, Ban, X, WifiOff, Pencil, Trash2 } from 'lucide-react'
import SocialBar from './SocialBar'
import CommentPanel from './CommentPanel'
import SocialAvatar from '@/components/social/SocialAvatar'
import PhotoViewer from '@/components/album/PhotoViewer'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalSocialPostById } from '@/lib/modules/offline/social-read'
import { travelDetailHref } from '@/lib/routes'

interface PostDetailData {
  id: number
  postId: number | null
  travelId: number | null
  title: string
  summary: string | null
  coverUrl: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  author: { id: number; username: string; nickname?: string | null; avatarUrl?: string | null } | null
  likeCount: number
  commentCount: number
  favoriteCount: number
  isLiked: boolean
  isFavorited: boolean
  publishedAt: string | null
  slug: string | null
  photos: string[]
  canEdit: boolean
}

export default function PostDetail({ postId }: { postId: number }) {
  const [post, setPost] = useState<PostDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [offline, setOffline] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [uploading, setUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let alive = true
    readWithFallback<PostDetailData>(
      async () => {
        const res = await fetch(apiUrl('/api/social/posts/' + postId), { credentials: 'include' })
        if (!res.ok) throw new Error('http ' + res.status)
        const json = await res.json()
        if (!json.data) throw new Error(json.error || '帖子不存在')
        return json.data as PostDetailData
      },
      async () => {
        const local = await readLocalSocialPostById(postId)
        return local as PostDetailData | null
      },
    )
      .then((result) => {
        if (!alive) return
        setPost(result.data)
        setOffline(result.source === 'local')
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '帖子不存在') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [postId])

  const submitReport = async () => {
    if (!reportReason.trim() || reporting) return
    setReporting(true)
    try {
      await fetch(apiUrl('/api/social/posts/' + postId + '/report'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reportReason }) })
      setShowReport(false); setReportReason('')
    } catch {} finally { setReporting(false) }
  }

  const blockAuthor = async () => {
    if (!post?.author) return
    setBlocked(true)
    try { await fetch(apiUrl('/api/social/users/' + post.author.id + '/block'), { method: 'POST', credentials: 'include' }) } catch {}
  }

  const refreshPost = async () => {
    try {
      const res = await fetch(apiUrl('/api/social/posts/' + postId), { credentials: 'include' })
      if (!res.ok) return
      const json = await res.json()
      if (json.data) {
        setPost(json.data)
        setOffline(false)
      }
    } catch {}
  }

  const openEdit = () => {
    if (!post) return
    setEditTitle(post.title)
    setEditSummary(post.summary || '')
    setEditError('')
    setShowEdit(true)
  }

  const saveEdit = async () => {
    if (!post || editSaving) return
    const title = editTitle.trim()
    if (!title) {
      setEditError('标题不能为空')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch(apiUrl('/api/social/posts/' + post.id), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary: editSummary.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.data) {
        setEditError(json.error || '保存失败')
        return
      }
      setPost(json.data)
      setShowEdit(false)
    } catch {
      setEditError('网络错误')
    } finally {
      setEditSaving(false)
    }
  }

  const uploadImages = async (files: FileList | File[]) => {
    if (!post?.postId || uploading) return
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    setEditError('')
    try {
      const form = new FormData()
      list.forEach((f) => form.append('files', f))
      form.append('postId', String(post.postId))
      const res = await fetch(apiUrl('/api/upload'), { method: 'POST', credentials: 'include', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditError(json.error || '图片上传失败')
        return
      }
      await refreshPost()
      if (photoInputRef.current) photoInputRef.current.value = ''
    } catch {
      setEditError('图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const deleteImage = async (url: string) => {
    if (!post?.postId) return
    const path = (() => {
      try { return new URL(url, window.location.origin).pathname } catch { return url }
    })()
    try {
      const res = await fetch(apiUrl('/api/upload'), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: path }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setEditError(json.error || '图片删除失败')
        return
      }
      await refreshPost()
    } catch {
      setEditError('图片删除失败')
    }
  }

  if (loading) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--social-bg)] text-[var(--social-faint)]"><Loader2 className="h-7 w-7 animate-spin" />加载中…</div>
  }
  if (error || !post) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--social-bg)] text-[var(--social-faint)]">{error || '帖子不存在'}<Link href="/circle" className="text-[var(--social-accent)]">返回旅行圈</Link></div>
  }

  const dateText = (post.startDate ? post.startDate.slice(0, 10) : '') + (post.endDate && post.endDate !== post.startDate ? ' ~ ' + post.endDate.slice(0, 10) : '')
  const authorName = post.author ? post.author.nickname || post.author.username : '旅行者'

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-28 text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%)]" />
      <div className="relative mx-auto max-w-3xl px-4 py-6">
        {offline && (
          <div className="mb-4 flex items-center justify-center gap-1.5 rounded-full bg-[var(--social-accent-soft)] px-4 py-1.5 text-xs text-[var(--social-accent)]">
            <WifiOff className="h-3.5 w-3.5" />
            离线模式：显示已缓存的帖子内容
          </div>
        )}
        <header className="mb-7 flex items-center gap-3">
          <Link href="/circle" className="rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="text-sm text-[var(--social-muted)]">旅行圈</span>
          <div className="ml-auto flex items-center gap-2">
            {post.canEdit && (
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-accent)] px-4 py-2 text-sm font-medium text-[var(--social-on-accent)] transition hover:bg-[var(--social-accent-strong)] active:scale-95"
              >
                <Pencil className="h-4 w-4" />编辑
              </button>
            )}
            <SocialThemeToggle />
          </div>
        </header>

        {post.coverUrl && (
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[1.6rem] bg-[var(--social-surface2)] ring-1 ring-[var(--social-line)]">
            <Image src={post.coverUrl} alt={post.title} fill priority sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
          </div>
        )}

        <div className="mt-8">
          {post.location && <div className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--social-accent)]">{post.location}</div>}
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--social-muted)]">
            {dateText && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{dateText}</span>}
            <span className="inline-flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />{post.photoCount} 张 · DAY {post.dayCount}</span>
          </div>

          {post.author && (
            <Link href={'/circle/user/' + post.author.id} className="mt-6 inline-flex items-center gap-2">
              <SocialAvatar name={authorName} avatarUrl={post.author.avatarUrl} size={34} />
              <span className="text-sm text-[var(--social-muted)]">{authorName}</span>
            </Link>
          )}

          {post.summary && <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-[var(--social-muted)]">{post.summary}</p>}
        </div>

        <SocialBar
          postId={post.id}
          likeCount={post.likeCount}
          favoriteCount={post.favoriteCount}
          commentCount={post.commentCount}
          liked={post.isLiked}
          favorited={post.isFavorited}
          onOpenComments={() => setShowComments(true)}
          className="mt-8"
        />

        <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-[var(--social-faint)]">
          <button type="button" onClick={() => setShowReport(true)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition hover:text-[var(--social-text)]"><Flag className="h-3.5 w-3.5" />举报</button>
          {post.author && !blocked && (
            <button type="button" onClick={blockAuthor} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition hover:text-[var(--social-text)]"><Ban className="h-3.5 w-3.5" />屏蔽作者</button>
          )}
          {blocked && <span>已屏蔽该作者</span>}
        </div>

        {post.photos && post.photos.length > 1 && (
          <div className="mt-12">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">旅行照片</h2>
              <div className="h-px flex-1 bg-[var(--social-line)]" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {post.photos.map((src, i) => (
                <button key={i} type="button" onClick={() => setViewerIndex(i)} className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--social-surface2)] ring-1 ring-[var(--social-line)]">
                  <Image src={src} alt={post.title} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                </button>
              ))}
            </div>
          </div>
        )}

        {post.slug && (
          <Link href={travelDetailHref(post.slug)} className="mt-10 inline-flex items-center gap-2 text-sm text-[var(--social-accent)] transition hover:text-[var(--social-accent-strong)]">查看完整旅行记录</Link>
        )}
      </div>

      {showReport && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowReport(false)} />
          <div className="absolute left-1/2 top-1/2 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[1.6rem] bg-[var(--social-surface)] p-5 ring-1 ring-[var(--social-line)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">举报该旅行</h3>
              <button onClick={() => setShowReport(false)} className="text-[var(--social-muted)] hover:text-[var(--social-text)]"><X className="h-4 w-4" /></button>
            </div>
            <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="请填写举报原因（如不当内容/广告/侵犯隐私等）" rows={3} className="w-full rounded-xl bg-[var(--social-bg)] px-3 py-2 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] focus:ring-[var(--social-accent)]" />
            <button onClick={submitReport} disabled={reporting || !reportReason.trim()} className="mt-3 w-full rounded-full bg-[var(--social-accent)] py-2.5 text-sm font-medium text-[var(--social-on-accent)] disabled:opacity-40">{reporting ? '提交中…' : '提交举报'}</button>
          </div>
        </div>
      )}
      {showEdit && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowEdit(false)} />
          <div className="absolute left-1/2 top-1/2 max-h-[88vh] w-[92%] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.6rem] bg-[var(--social-surface)] p-5 ring-1 ring-[var(--social-line)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">编辑旅行故事</h3>
              <button type="button" onClick={() => setShowEdit(false)} className="text-[var(--social-muted)] transition hover:text-[var(--social-text)]" aria-label="关闭编辑"><X className="h-5 w-5" /></button>
            </div>

            <label className="mb-1.5 block text-xs text-[var(--social-muted)]">标题</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={255}
              placeholder="输入标题"
              className="w-full rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] transition focus:ring-[var(--social-accent)]"
            />

            <label className="mb-1.5 mt-4 block text-xs text-[var(--social-muted)]">内容 / 摘要</label>
            <textarea
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              rows={5}
              placeholder="写下这次旅行的故事…"
              className="w-full resize-none rounded-xl bg-[var(--social-bg)] px-4 py-3 text-sm text-[var(--social-text)] outline-none ring-1 ring-[var(--social-line)] transition focus:ring-[var(--social-accent)]"
            />

            {post.postId != null ? (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-[var(--social-muted)]">旅行照片</span>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-3 py-1.5 text-xs text-[var(--social-accent)] ring-1 ring-[var(--social-line)] transition hover:ring-[var(--social-accent)] disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    上传图片
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) uploadImages(e.target.files) }}
                  />
                </div>

                {post.photos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {post.photos.map((src) => (
                      <div key={src} className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--social-surface2)] ring-1 ring-[var(--social-line)]">
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => deleteImage(src)}
                          aria-label="删除图片"
                          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-[var(--social-bg)] px-4 py-6 text-center text-xs text-[var(--social-faint)]">还没有照片，点击“上传图片”添加。</p>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-[var(--social-bg)] px-4 py-4 text-xs text-[var(--social-faint)]">图片请在旅行详情中统一管理。</p>
            )}

            {editError && <p className="mt-3 text-sm text-[#E06C6C]">{editError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="rounded-full px-5 py-2.5 text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editSaving || uploading}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-accent)] px-5 py-2.5 text-sm font-medium text-[var(--social-on-accent)] transition hover:bg-[var(--social-accent-strong)] disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      {showComments && <CommentPanel postId={post.id} onClose={() => setShowComments(false)} />}
      {viewerIndex !== null && post.photos.length > 0 && (
        <PhotoViewer images={post.photos.map((src) => ({ src, alt: post.title }))} index={viewerIndex} onClose={() => setViewerIndex(null)} onIndexChange={setViewerIndex} />
      )}
    </div>
  )
}
