'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, MapPin, Camera, Users, Loader2, LayoutGrid, Orbit, X } from 'lucide-react'
import { apiUrl } from '@/lib/api-base'
import { TRAVEL_TYPE_LABELS, MOOD_LABEL, formatDay } from '@/lib/modules/album/presentation'
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

function Photo({ photo, variant = 'preview' }: { photo: BookPhoto; variant?: 'preview' | 'thumb' }) {
  const src = variant === 'preview' ? (photo.previewUrl || photo.thumbnailUrl) : (photo.thumbnailUrl || photo.previewUrl)
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3'
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || ''}
      alt=""
      loading="lazy"
      className="h-full w-full rounded-[2px] object-cover"
      style={{ aspectRatio: ratio }}
    />
  )
}

function ChapterPage({ chapter, totalChapters }: { chapter: BookChapter; totalChapters: number }) {
  const photos = chapter.photos.slice(0, 12)
  const textMemories = chapter.memories.filter((m) => m.content)
  // Quote 页：照片极少 + 有回忆文字 → 居中大引语（杂志感）
  if (chapter.photos.length <= 2 && textMemories.length > 0) {
    const m = textMemories[0]
    return (
      <div className="flex min-h-full flex-col justify-center overflow-hidden">
        <div className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-travel-bloom">
          Chapter {String(chapter.index).padStart(2, '0')}
        </div>
        <blockquote className="mt-6 font-display text-xl leading-relaxed text-travel-ink sm:text-2xl">
          “{m.content}”
        </blockquote>
        <div className="mt-6 flex items-center gap-2 text-xs text-travel-ink/50">
          <span className="inline-block h-px w-8 bg-travel-bloom/60" />
          <span>{chapter.title || `DAY ${String(chapter.index).padStart(2, '0')}`}</span>
          {chapter.date && <span>· {formatDay(chapter.date)}</span>}
          {m.mood ? `· ${MOOD_LABEL[m.mood] || m.mood}` : ''}
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 章节头 */}
      <header className="mb-4 border-b border-travel-dim/40 pb-3">
        <div className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-travel-bloom">
          Chapter {String(chapter.index).padStart(2, '0')}
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-travel-ink/70">
          <span>DAY {String(chapter.index).padStart(2, '0')}</span>
          {chapter.date && <span>· {formatDay(chapter.date)}</span>}
          {chapter.title && <span className="font-medium text-travel-ink">· {chapter.title}</span>}
        </div>
      </header>

      {/* 照片：首图 hero，其余网格 */}
      {photos.length > 0 && (
        <div className="space-y-1.5">
          <div className="aspect-[4/3] w-full overflow-hidden">
            <Photo photo={photos[0]} />
          </div>
          {photos.length > 1 && (
            <div className="grid grid-cols-2 gap-1.5">
              {photos.slice(1).map((p) => (
                <div key={p.id} className="aspect-square w-full overflow-hidden">
                  <Photo photo={p} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 回忆 */}
      {chapter.memories.filter((m) => m.content).length > 0 && (
        <div className="mt-3 space-y-2 overflow-y-auto">
          {chapter.memories.filter((m) => m.content).map((m) => (
            <blockquote key={m.id} className="rounded-sm border-l-2 border-travel-bloom/50 bg-travel-sakura/20 px-3 py-2">
              <p className="text-sm leading-relaxed text-travel-ink/85">{m.content}</p>
              <span className="mt-1 block text-[10px] tracking-widest text-travel-ink/40">
                {m.title}{m.mood ? ` · ${MOOD_LABEL[m.mood] || m.mood}` : ''}
              </span>
            </blockquote>
          ))}
        </div>
      )}

      {/* 行程 */}
      {chapter.itinerary.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chapter.itinerary.map((it) => (
            <span key={it.id} className="inline-flex items-center gap-1 rounded-full bg-travel-mist/40 px-2.5 py-1 text-[11px] text-travel-ink/70">
              <MapPin className="h-3 w-3 text-travel-bloom" />
              {it.title}
              {it.locationName ? `（${it.locationName}）` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryPage({ book, chapterCount }: { book: Book; chapterCount: number }) {
  const stats = [
    { label: '天数', value: book.dayCount || chapterCount },
    { label: '照片', value: book.photoCount },
  ]
  return (
    <div className="flex min-h-full flex-col justify-center overflow-hidden">
      <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-travel-bloom">End · 旅行总结</div>
      <h2 className="font-display mt-3 text-2xl font-bold text-travel-ink sm:text-3xl">{book.title}</h2>
      {book.location && (
        <p className="mt-2 inline-flex items-center gap-1 text-sm text-travel-ink/60">
          <MapPin className="h-3.5 w-3.5" />
          {book.location}
        </p>
      )}
      <div className="mt-6 grid max-w-xs grid-cols-2 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border-t border-travel-bloom/40 pt-3">
            <div className="font-display text-3xl font-bold text-travel-accent">{s.value}</div>
            <div className="mt-1 text-xs tracking-widest text-travel-ink/50">{s.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-8 border-t border-travel-dim/40 pt-4 text-sm text-travel-ink/60">谢谢翻阅，收藏这段路上的时光。</p>
    </div>
  )
}

function Reader({ book, onBack }: { book: Book; onBack: () => void }) {
  const chapters = book.chapters
  const totalPages = chapters.length + 2 // 封面 + 章节 + 旅行总结
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')

  const go = useCallback((next: number) => {
    setDir(next > page ? 'next' : 'prev')
    setPage(Math.max(0, Math.min(totalPages - 1, next)))
  }, [page, totalPages])

  // 键盘左右
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(page + 1)
      else if (e.key === 'ArrowLeft') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, page])

  const isCover = page === 0
  const isSummary = page === totalPages - 1
  const chapter = !isCover && !isSummary ? chapters[page - 1] : null

  return (
    <div className="fixed inset-0 z-[105] flex flex-col bg-travel-cream">
      {/* 顶栏 */}
      <header className="flex items-center justify-between border-b border-travel-dim/40 px-4 py-2.5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura">
          <ChevronLeft className="h-3.5 w-3.5" />
          我的旅行画册
        </button>
        <div className="flex items-center gap-2 font-display text-sm font-semibold text-travel-ink">
          <BookOpen className="h-4 w-4 text-travel-bloom" />
          {book.title}
        </div>
        <button type="button" onClick={onBack} aria-label="关闭" className="rounded-full p-2 text-travel-ink/60 hover:bg-travel-sakura/40 hover:text-travel-ink">
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* 页面主体 */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-4">
        <div key={page} className={`tb-paper ${dir === 'next' ? 'tb-page-next' : 'tb-page-prev'} relative h-full max-h-[calc(100vh-150px)] w-full max-w-3xl overflow-y-auto rounded-[2px] bg-[#FFFCF7] p-6 shadow-[0_20px_60px_-30px_rgba(41,39,35,0.45)] sm:p-8`}>
          {isCover ? (
            <div className="flex min-h-full flex-col overflow-hidden">
              {book.coverPreview ? (
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={book.coverPreview} alt={book.title} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-travel-sakura/30">
                  <Camera className="h-10 w-10 text-travel-bloom/50" />
                </div>
              )}
              <div className="mt-5 flex flex-1 flex-col justify-end">
                <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-travel-bloom">Travel Notes</div>
                <h1 className="font-display mt-2 text-2xl font-bold text-travel-ink sm:text-3xl">{book.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-travel-ink/60">
                  {book.travelType && (
                    <span className="rounded-full bg-travel-sakura/50 px-2 py-0.5 text-travel-accent">{TRAVEL_TYPE_LABELS[book.travelType] || book.travelType}</span>
                  )}
                  {book.location && (
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{book.location}</span>
                  )}
                  {book.startDate && <span>{formatDay(book.startDate)}</span>}
                </div>
                {Array.isArray(book.companions) && (book.companions as any[]).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(book.companions as any[]).map((c, i) => {
                      const name = String(c?.name || '').trim()
                      if (!name) return null
                      return (
                        <span key={`${name}-${i}`} className="inline-flex items-center gap-1 text-[11px] text-travel-ink/50">
                          <Users className="h-3 w-3" />{name}
                        </span>
                      )
                    })}
                  </div>
                )}
                {book.description && <p className="mt-4 text-sm leading-relaxed text-travel-ink/70">{book.description}</p>}
              </div>
            </div>
          ) : isSummary ? (
            <SummaryPage book={book} chapterCount={chapters.length} />
          ) : chapter ? (
            <ChapterPage chapter={chapter} totalChapters={chapters.length} />
          ) : null}

          {/* 页码 */}
          <div className="mt-6 flex items-center justify-between border-t border-travel-dim/30 pt-3 text-xs text-travel-ink/50">
            <span>01 / {String(totalPages).padStart(2, '0')}</span>
            <span className="tracking-[0.3em]">{String(page + 1).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}</span>
          </div>
        </div>
      </main>

      {/* 导航 */}
      <footer className="flex items-center justify-center gap-3 border-t border-travel-dim/40 px-4 py-3">
        <button type="button" onClick={() => go(page - 1)} disabled={page === 0} className="inline-flex items-center gap-1 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" />上一页
        </button>
        <div className="flex flex-wrap justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-label={`第 ${i + 1} 页`} className={`h-1.5 w-1.5 rounded-full ${i === page ? 'bg-travel-bloom' : 'bg-travel-dim/40'} transition-all`} />
          ))}
        </div>
        <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages - 1} className="inline-flex items-center gap-1 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura disabled:opacity-40">
          下一页<ChevronRight className="h-3.5 w-3.5" />
        </button>
      </footer>
    </div>
  )
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
    fetch(apiUrl('/api/travel-book'), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        setBooks(j?.books || [])
        if (!j?.books?.length) setError('还没有旅行故事，去记录一次旅行吧。')
      })
      .catch(() => setError('旅行画册加载失败'))
  }, [])
  useEffect(() => { load() }, [load])

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
            <p className="text-xs text-travel-ink/40">在「旅行」或后台创建一次旅行，就会生成一本画册</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3">
            {books.map((book) => (
              <PostcardCard key={book.travelId} book={book} onOpen={() => setOpenBook(book)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
