'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { BookOpen, Camera, Loader2, LayoutGrid, Orbit, ArrowLeft, ArrowDownUp, Images, CalendarDays } from 'lucide-react'
import { apiUrl } from '@/lib/api-base'
import BookReader from './BookReader'
import Sketchbook from '../sketchbook/Sketchbook'
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
  /** 稳定唯一键：travel:{id} / city:{城市名}（React key / 打开单本拉取用，城市画册 travelId 恒为 0） */
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

/** 列表摘要（不含章节明细）：画册墙用，打开某本再拉全书 */
export type BookSummary = Omit<Book, 'chapters'>

/**
 * 旅行画册 2.0（Phase 2）：默认以 Travel 模型驱动一本本「旅行摄影杂志」。
 * @param onModeChange 切换到照片网格(▦) / 银河空间(✨)
 */
export default function TravelBook({ onModeChange }: { onModeChange: (m: Mode) => void }) {
  const [books, setBooks] = useState<BookSummary[] | null>(null)
  const [error, setError] = useState('')
  const [openBook, setOpenBook] = useState<Book | null>(null)
  const [readerMode, setReaderMode] = useState<'classic' | 'art' | 'sketch'>('classic')
  const [sortBy, setSortBy] = useState<'latest' | 'days' | 'photos'>('latest')

  const sortedBooks = useMemo(() => {
    if (!books) return []
    const list = [...books]
    if (sortBy === 'days') {
      list.sort((a, b) => (b.dayCount || 0) - (a.dayCount || 0))
    } else if (sortBy === 'photos') {
      list.sort((a, b) => (b.photoCount || 0) - (a.photoCount || 0))
    } else {
      list.sort((a, b) => (
        (Date.parse(b.startDate || b.endDate || '') || 0) -
        (Date.parse(a.startDate || a.endDate || '') || 0)
      ))
    }
    return list
  }, [books, sortBy])

  const wallStats = useMemo(() => {
    const list = books || []
    return {
      count: list.length,
      days: list.reduce((sum, book) => sum + (book.dayCount || 0), 0),
      photos: list.reduce((sum, book) => sum + (book.photoCount || 0), 0),
    }
  }, [books])

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

  // 打开某本：先拉全书（章节/照片明细），再进阅读器
  const openBookByKey = useCallback((summary: BookSummary) => {
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
  }, [])

  if (openBook) {
    if (readerMode === 'classic' || readerMode === 'art') {
      return (
        <BookReader
          book={openBook}
          onBack={() => setOpenBook(null)}
          mode={readerMode === 'art' ? 'art' : 'classic'}
          onToggleArt={() => setReaderMode(readerMode === 'art' ? 'classic' : 'art')}
          onToggleSketch={() => setReaderMode('sketch')}
        />
      )
    }
    return <Sketchbook book={openBook} onBack={() => setOpenBook(null)} onToggleBook={() => setReaderMode('classic')} />
  }

  return (
    <div className="min-h-screen bg-travel-cream">
      {/* 顶栏：与像素/银河模式同构（返回首页 + 标题 + 模式切换） */}
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
          <button type="button" onClick={() => onModeChange('pixel')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-travel-ink/70 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink" title="切换到照片网格">
            <LayoutGrid className="h-3.5 w-3.5" />网格
          </button>
          <button type="button" onClick={() => onModeChange('space')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-travel-ink/70 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink" title="切换到银河空间">
            <Orbit className="h-3.5 w-3.5" />银河
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {books === null ? (
          <div className="flex items-center justify-center gap-2 py-24 text-travel-ink/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">正在翻阅旅行画册...</span>
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Camera className="h-10 w-10 text-travel-bloom/40" />
            <p className="text-sm text-travel-ink/60">{error || '还没有旅行故事'}</p>
            {error.startsWith('旅行画册加载失败') ? (
              <button
                type="button"
                onClick={() => { setBooks(null); load() }}
                className="rounded-full bg-travel-sakura px-4 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura/70"
              >
                重试
              </button>
            ) : (
              <p className="text-xs text-travel-ink/40">在「旅行」或后台创建一次旅行，就会生成一本画册</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-sm font-semibold text-travel-ink">旅行画册</h2>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-travel-ink/55">
                  <span className="inline-flex items-center gap-1.5">{wallStats.count} 本</span>
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{wallStats.days} 天</span>
                  <span className="inline-flex items-center gap-1.5"><Images className="h-3.5 w-3.5" />{wallStats.photos} 张照片</span>
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-travel-ink/60">
                <ArrowDownUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">排序</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'latest' | 'days' | 'photos')}
                  aria-label="画册排序方式"
                  className="rounded-md border border-travel-dim/60 bg-travel-cream px-2.5 py-1.5 text-xs text-travel-ink outline-none focus:border-travel-bloom"
                >
                  <option value="latest">按旅行时间</option>
                  <option value="days">按天数</option>
                  <option value="photos">按照片数</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3">
              {sortedBooks.map((book) => (
                <PostcardCard key={book.bookKey || book.travelId} book={book} onOpen={() => openBookByKey(book)} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
