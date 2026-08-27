'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, MapPin, CalendarDays, Loader2, Image as ImageIcon, Flag, Ban, X, WifiOff } from 'lucide-react'
import SocialBar from './SocialBar'
import CommentPanel from './CommentPanel'
import SocialAvatar from '@/components/social/SocialAvatar'
import PhotoViewer from '@/components/album/PhotoViewer'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalSocialPostById } from '@/lib/modules/offline/social-read'

interface PostDetailData {
  id: number
  travelId: number
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
      await fetch('/api/social/posts/' + postId + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reportReason }) })
      setShowReport(false); setReportReason('')
    } catch {} finally { setReporting(false) }
  }

  const blockAuthor = async () => {
    if (!post?.author) return
    setBlocked(true)
    try { await fetch('/api/social/users/' + post.author.id + '/block', { method: 'POST' }) } catch {}
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
          <div className="ml-auto"><SocialThemeToggle /></div>
          <Link href="/circle" className="rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="text-sm text-[var(--social-muted)]">旅行圈</span>
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
          <Link href={'/travel/' + encodeURIComponent(post.slug)} className="mt-10 inline-flex items-center gap-2 text-sm text-[var(--social-accent)] transition hover:text-[var(--social-accent-strong)]">查看完整旅行记录</Link>
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
      {showComments && <CommentPanel postId={post.id} onClose={() => setShowComments(false)} />}
      {viewerIndex !== null && post.photos.length > 0 && (
        <PhotoViewer images={post.photos.map((src) => ({ src, alt: post.title }))} index={viewerIndex} onClose={() => setViewerIndex(null)} onIndexChange={setViewerIndex} />
      )}
    </div>
  )
}
