'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, Camera, Loader2, LayoutGrid, Orbit } from 'lucide-react'
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
  /** 稳定唯一键：travel:{id} / city:{城市名}（React key 用，城市画册 travelId 恒为 0） */
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

/**
 * 旅行画册 2.0（Phase 2）：默认以 Travel 模型驱动一本本「旅行摄影杂志」。
 * @param onModeChange 切换到照片网格(▦) / 银河空间(✨)
 */
export default function TravelBook({ onModeChange }: { onModeChange: (m: Mode) => void }) {
  const [books, setBooks] = useState<Book[] | null>(null)
  const [error, setError] = useState('')
  const [openBook, setOpenBook] = useState<Book | null>(null)
  const [readerMode, setReaderMode] = useState<'sketch' | 'book'>('sketch')

  const load = useCallback(() => {
    const ac = new AbortController()
    fetch(apiUrl('/api/travel-book'), { credentials: 'include', signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        const list: Book[] = Array.isArray(j?.books) ? j.books : []
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
    if (readerMode === 'book') {
      return <BookReader book={openBook} onBack={() => setOpenBook(null)} onToggleSketch={() => setReaderMode('sketch')} />
    }
    return <Sketchbook book={openBook} onBack={() => setOpenBook(null)} onToggleBook={() => setReaderMode('book')} />
  }

  return (
    <div className="min-h-screen bg-travel-cream">
      {/* 顶栏 */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-travel-dim/40 bg-travel-cream/90 px-4 backdrop-blur-md md:px-8">
        <div className="flex items-center gap-2 font-semibold text-travel-ink">
          <BookOpen className="h-4 w-4 text-travel-bloom" />
          <span className="text-sm sm:text-base">我的旅行画册</span>
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
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3">
            {books.map((book) => (
              <PostcardCard key={book.bookKey || book.travelId} book={book} onOpen={() => setOpenBook(book)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
