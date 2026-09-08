'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Camera, LayoutGrid, Loader2, Orbit } from 'lucide-react'
import { apiUrl } from '@/lib/api-base'
import BookReader from './BookReader'
import PostcardCard from '../PostcardCard'

type Mode = 'book' | 'space' | 'pixel'

export interface BookPhoto {
  id: number
  thumbnailUrl: string | null
  previewUrl: string | null
  blurUrl: string | null
  fullUrl: string | null
  width: number | null
  height: number | null
}

export interface BookChapter {
  id: number
  index: number
  date: string | null
  title: string | null
  summary: string | null
  itinerary: { id: number; title: string; locationName: string | null }[]
  memories: { id: number; title: string; content: string | null; mood: string | null; photos: BookPhoto[] }[]
  photos: BookPhoto[]
}

export interface Book {
  bookKey: string
  travelId: number
  slug: string
  title: string
  description: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  travelType: string | null
  companions: unknown
  coverThumb: string | null
  coverPreview: string | null
  coverBlur: string | null
  dayCount: number
  photoCount: number
  chapters: BookChapter[]
}

export type BookSummary = Omit<Book, 'chapters'>

/**
 * 相册统一入口：只保留上传图片生成的这一本旅行画册。
 * 点击进入阅读器后统一使用 page-flip 摄影画册，不再拆分经典/素描本子模块。
 */
export default function TravelBook({ onModeChange }: { onModeChange: (m: Mode) => void }) {
  const [books, setBooks] = useState<BookSummary[] | null>(null)
  const [error, setError] = useState('')
  const [openBook, setOpenBook] = useState<Book | null>(null)
  const [opening, setOpening] = useState(false)

  const openBookByKey = useCallback((summary: BookSummary) => {
    setOpening(true)
    fetch(apiUrl(`/api/travel-book?key=${encodeURIComponent(summary.bookKey)}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (j?.book) setOpenBook(j.book)
        else setError('画册打开失败，请稍后重试。')
      })
      .catch(() => setError('画册打开失败，请稍后重试。'))
      .finally(() => setOpening(false))
  }, [])

  const load = useCallback(() => {
    const ac = new AbortController()
    fetch(apiUrl('/api/travel-book'), { credentials: 'include', signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        const list: BookSummary[] = Array.isArray(j?.books) ? j.books : []
        setBooks(list)
        setError(list.length ? '' : '还没有旅行故事，去记录一次旅行吧。')
      })
      .catch((err) => {
        if (ac.signal.aborted) return
        setBooks([])
        setError('旅行画册加载失败，请稍后重试。')
        void err
      })
    return () => ac.abort()
  }, [])

  useEffect(() => load(), [load])

  if (openBook) {
    return <BookReader book={openBook} onBack={() => setOpenBook(null)} />
  }

  return (
    <div className="min-h-screen bg-travel-cream">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-travel-dim/40 bg-travel-cream/90 px-3 backdrop-blur-md md:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            aria-label="返回首页"
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-travel-ink/80 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">返回首页</span>
          </Link>
          <div className="flex items-center gap-2 font-semibold text-travel-ink">
            <BookOpen className="h-4 w-4 text-travel-bloom" />
            <span className="truncate text-sm sm:text-base">我的旅行画册</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-full border border-travel-dim/40 bg-travel-cream/60 p-0.5">
          <button type="button" className="inline-flex items-center gap-1 rounded-full bg-travel-sakura px-3 py-1.5 text-xs font-medium text-travel-ink shadow-sm" title="当前视图（旅行画册）">
            <Camera className="h-3.5 w-3.5" />画册
          </button>
          <button
            type="button"
            onClick={() => onModeChange('pixel')}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-travel-ink/70 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink"
            title="切换到照片网格"
          >
            <LayoutGrid className="h-3.5 w-3.5" />网格
          </button>
          <button
            type="button"
            onClick={() => onModeChange('space')}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-travel-ink/70 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink"
            title="切换到银河空间"
          >
            <Orbit className="h-3.5 w-3.5" />银河
          </button>
        </div>
      </header>

      <main className="flex min-h-[calc(100dvh-56px)] items-center justify-center px-4 py-8">
        {books === null || opening ? (
          <div className="flex items-center justify-center gap-2 text-travel-ink/45">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{opening ? '正在翻开旅行画册...' : '正在翻开旅行画册...'}</span>
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Camera className="h-10 w-10 text-travel-bloom/40" />
            <p className="text-sm text-travel-ink/60">{error || '还没有旅行故事'}</p>
            {error ? (
              <button
                type="button"
                onClick={() => {
                  setBooks(null)
                  load()
                }}
                className="rounded-full bg-travel-sakura px-4 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura/70"
              >
                重试
              </button>
            ) : (
              <p className="text-xs text-travel-ink/40">在「旅行」或后台创建一次旅行，就会生成一本画册</p>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <PostcardCard book={books[0]} onOpen={() => openBookByKey(books[0])} />
          </div>
        )}
      </main>
    </div>
  )
}
