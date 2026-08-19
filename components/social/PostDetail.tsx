'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, MapPin, CalendarDays, Loader2, Image as ImageIcon, User, Flag, Ban, X } from 'lucide-react'
import SocialBar from './SocialBar'
import CommentPanel from './CommentPanel'
import AlbumPhoto from '@/components/album/AlbumPhoto'
import PhotoViewer from '@/components/album/PhotoViewer'

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
  author: { id: number; username: string } | null
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

  useEffect(() => {
    fetch('/api/social/posts/' + postId)
      .then((r) => r.json())
      .then((json) => { if (json.data) setPost(json.data); else setError(json.error || '帖子不存在') })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false))
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
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-album-bg0 text-album-text3"><Loader2 className="h-7 w-7 animate-spin" />加载中…</div>
  }
  if (error || !post) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-album-bg0 text-album-text3">{error || '帖子不存在'}<Link href="/circle" className="text-album-accent">返回旅行圈</Link></div>
  }

  const dateText = (post.startDate ? post.startDate.slice(0, 10) : '') + (post.endDate && post.endDate !== post.startDate ? ' ~ ' + post.endDate.slice(0, 10) : '')

  return (
    <div className="min-h-screen bg-album-bg0 pb-24">
      <div className="mx-auto max-w-3xl px-4">
        <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-white/10 bg-album-bg0/90 px-4 py-3 backdrop-blur">
          <Link href="/circle" className="rounded-full p-1.5 text-album-text2 hover:bg-white/10 hover:text-album-text1"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="text-sm text-album-text2">旅行圈</span>
        </header>

        {post.coverUrl && (
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3xl bg-album-bg2">
            <Image src={post.coverUrl} alt={post.title} fill priority sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
          </div>
        )}

        <div className="mt-5">
          <h1 className="text-2xl font-bold leading-snug text-album-text1">{post.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-album-text2">
            {post.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{post.location}</span>}
            {dateText && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{dateText}</span>}
            <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{post.photoCount} 张 · DAY {post.dayCount}</span>
          </div>

          {post.author && (
            <Link href={'/circle/user/' + post.author.id} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-album-text2 hover:text-album-text1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-album-accent/20 text-album-accent"><User className="h-3.5 w-3.5" /></span>
              {post.author.username}
            </Link>
          )}

          {post.summary && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-album-text1/85">{post.summary}</p>}
        </div>

        <SocialBar
          postId={post.id}
          likeCount={post.likeCount}
          favoriteCount={post.favoriteCount}
          commentCount={post.commentCount}
          liked={post.isLiked}
          favorited={post.isFavorited}
          onOpenComments={() => setShowComments(true)}
          className="mt-6"
        />

        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-album-text3">
          <button type="button" onClick={() => setShowReport(true)} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 hover:text-album-error"><Flag className="h-3.5 w-3.5" />举报</button>
          {post.author && !blocked && (
            <button type="button" onClick={blockAuthor} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 hover:text-album-error"><Ban className="h-3.5 w-3.5" />屏蔽作者</button>
          )}
          {blocked && <span className="text-album-text3">已屏蔽该作者</span>}
        </div>

        {post.photos && post.photos.length > 1 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-album-text1">旅行照片</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {post.photos.map((src, i) => (
                <AlbumPhoto key={i} src={src} alt={post.title} aspect="square" onClick={() => setViewerIndex(i)} />
              ))}
            </div>
          </div>
        )}

        {post.slug && (
          <Link href={'/travel/' + encodeURIComponent(post.slug)} className="mt-8 inline-flex items-center gap-2 rounded-full border border-album-accent/40 px-5 py-2.5 text-sm text-album-accent hover:bg-album-accent/10">
            查看完整旅行记录
          </Link>
        )}
      </div>

      {showReport && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowReport(false)} />
          <div className="absolute left-1/2 top-1/2 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-album-bg1 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-album-text1">举报该旅行</h3>
              <button onClick={() => setShowReport(false)} className="text-album-text3 hover:text-album-text1"><X className="h-4 w-4" /></button>
            </div>
            <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="请填写举报原因（如不当内容/广告/侵犯隐私等）" rows={3} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-album-text1 placeholder:text-album-text3 focus:outline-none" />
            <button onClick={submitReport} disabled={reporting || !reportReason.trim()} className="mt-3 w-full rounded-full bg-album-accent py-2.5 text-sm font-medium text-album-bg0 disabled:opacity-40">{reporting ? '提交中…' : '提交举报'}</button>
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
