'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Camera,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Orbit,
  X,
} from 'lucide-react'
import { apiUrl } from '@/lib/api-base'
import { TRAVEL_TYPE_LABELS, formatDotDate } from '@/lib/modules/album/presentation'
import BookReader from './BookReader'
import PostcardCard from '../PostcardCard'

type Mode = 'book' | 'space' | 'pixel'

const WALL_VIEW_KEY = 'album-wall-view'
type WallView = 'wall' | 'list'

/** 打开画册前保存墙位，返回时恢复（session 级，刷新作废） */
const WALL_SCROLL_KEY = 'album-wall-scroll-y'

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
 * 旅行画册统一入口：每个城市一本画册（Travel 模型优先 + Post 城市画册兜底）。
 * 墙上以「东倒西歪」的散落卡片陈列所有城市画册，点击某本进入 page-flip 翻页阅读器。
 */
export default function TravelBook({
  onModeChange,
  initialBookKey,
}: {
  onModeChange: (m: Mode) => void
  initialBookKey?: string | null
}) {
  const [books, setBooks] = useState<BookSummary[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [openError, setOpenError] = useState('')
  const [openBook, setOpenBook] = useState<Book | null>(null)
  const [opening, setOpening] = useState(false)
  const [openingTitle, setOpeningTitle] = useState('')
  const [wallView, setWallView] = useState<WallView>('wall')
  const abortRef = useRef<AbortController | null>(null)

  const wallStats = useMemo(() => {
    const list = books || []
    return {
      count: list.length,
      days: list.reduce((sum, book) => sum + (book.dayCount || 0), 0),
      photos: list.reduce((sum, book) => sum + (book.photoCount || 0), 0),
    }
  }, [books])

  const openBookByKey = useCallback((summary: BookSummary) => {
    try {
      sessionStorage.setItem(WALL_SCROLL_KEY, String(window.scrollY || 0))
    } catch {
      // 忽略
    }
    setOpening(true)
    setOpeningTitle(summary.title || '旅行画册')
    setOpenError('')
    fetch(apiUrl(`/api/travel-book?key=${encodeURIComponent(summary.bookKey)}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (j?.book) {
          setOpenBook(j.book)
        } else {
          setOpenError('画册打开失败，请稍后重试。')
        }
      })
      .catch(() => {
        setOpenError('画册打开失败，请稍后重试。')
      })
      .finally(() => setOpening(false))
  }, [])

  // 深链直达：/album?book=<bookKey> 打开指定画册（首页画册目录 → 城市直达）
  const openedKeyRef = useRef('')
  useEffect(() => {
    if (!initialBookKey || openedKeyRef.current === initialBookKey) return
    openedKeyRef.current = initialBookKey
    const summary = books?.find((b) => b.bookKey === initialBookKey)
    if (summary) {
      openBookByKey(summary)
    } else if (books && books.length > 0) {
      // 摘要里没有（可能刚产生/缓存不同步）：尝试按 key 直接拉全书
      setOpening(true)
      setOpeningTitle('旅行画册')
      setOpenError('')
      fetch(apiUrl(`/api/travel-book?key=${encodeURIComponent(initialBookKey)}`), { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j?.book) setOpenBook(j.book)
          else setOpenError('画册打开失败，请稍后重试。')
        })
        .catch(() => setOpenError('画册打开失败，请稍后重试。'))
        .finally(() => setOpening(false))
    }
  }, [initialBookKey, books, openBookByKey])

  const load = useCallback(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    fetch(apiUrl('/api/travel-book'), { credentials: 'include', signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (ac.signal.aborted) return
        const list: BookSummary[] = Array.isArray(j?.books) ? j.books : []
        setBooks(list)
        setLoadError('')
      })
      .catch((err) => {
        if (ac.signal.aborted) return
        setBooks([])
        setLoadError('旅行画册加载失败，请稍后重试。')
        void err
      })
  }, [])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  // 画册墙陈列偏好：卡片墙 / 目录列表，本地记忆
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WALL_VIEW_KEY)
      if (saved === 'wall' || saved === 'list') setWallView(saved)
    } catch {
      // 忽略
    }
  }, [])

  const changeWallView = useCallback((next: WallView) => {
    setWallView(next)
    try {
      localStorage.setItem(WALL_VIEW_KEY, next)
    } catch {
      // 忽略
    }
  }, [])

  const retryLoad = useCallback(() => {
    setBooks(null)
    setLoadError('')
    load()
  }, [load])

  const closeReader = useCallback(() => {
    setOpenBook(null)
    // 返回墙：恢复打开前的滚动位置
    let saved = 0
    try {
      const raw = sessionStorage.getItem(WALL_SCROLL_KEY)
      if (raw) saved = Number(raw) || 0
      sessionStorage.removeItem(WALL_SCROLL_KEY)
    } catch {
      // 忽略
    }
    requestAnimationFrame(() => window.scrollTo({ top: saved, left: 0, behavior: 'instant' as ScrollBehavior }))
    // 深链/直达返回时清理 URL 参数，避免再次进入自动重开
    if (window.location.search.includes('book=')) {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('book')
        window.history.replaceState(null, '', url.href)
      } catch {
        // 忽略
      }
    }
  }, [])

  if (openBook) {
    return <BookReader book={openBook} onBack={closeReader} />
  }

  return (
    <div className="min-h-screen bg-travel-cream dark:bg-shell-bg">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-travel-dim/40 bg-travel-cream/90 px-3 backdrop-blur-md md:px-8 dark:border-shell-line dark:bg-shell-bg/90">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            aria-label="返回首页"
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-travel-ink/80 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">返回首页</span>
          </Link>
          <div className="flex items-center gap-2 font-semibold text-travel-ink dark:text-shell-text">
            <BookOpen className="h-4 w-4 text-travel-bloom" />
            <span className="truncate text-sm sm:text-base">我的旅行画册</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-full border border-travel-dim/40 bg-travel-cream/60 p-0.5 dark:border-shell-line dark:bg-shell-surface3/80">
          <button type="button" className="inline-flex items-center gap-1 rounded-full bg-travel-sakura px-3 py-1.5 text-xs font-medium text-travel-ink shadow-sm dark:bg-travel-accent/20 dark:text-travel-bloom" title="当前视图（旅行画册）">
            <Camera className="h-3.5 w-3.5" />画册
          </button>
          <button
            type="button"
            onClick={() => onModeChange('pixel')}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-travel-ink/70 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text"
            title="切换到照片网格"
          >
            <LayoutGrid className="h-3.5 w-3.5" />网格
          </button>
          <button
            type="button"
            onClick={() => onModeChange('space')}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-travel-ink/70 transition-colors hover:bg-travel-sakura/50 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text"
            title="切换到银河空间"
          >
            <Orbit className="h-3.5 w-3.5" />银河
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {books === null && !loadError ? (
          <div className="flex items-center justify-center gap-2 py-24 text-travel-ink/45 dark:text-shell-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">正在翻阅旅行画册，把走过的城市一本本摊开...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <AlertCircle className="h-10 w-10 text-red-400/70" />
            <p className="text-sm text-travel-ink/60 dark:text-shell-muted">{loadError}</p>
            <button
              type="button"
              onClick={retryLoad}
              className="rounded-full bg-travel-sakura px-4 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura/70"
            >
              重试
            </button>
          </div>
        ) : books && books.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Camera className="h-10 w-10 text-travel-bloom/40" />
            <p className="text-sm text-travel-ink/60 dark:text-shell-muted">还没有旅行故事，去记录一次旅行吧。</p>
            <p className="text-xs text-travel-ink/40 dark:text-shell-faint">在「旅行」或后台创建一次旅行，就会生成一本画册</p>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-travel-ink dark:text-shell-text">旅行画册</h2>
                <p className="mt-1.5 text-xs text-travel-ink/55 dark:text-shell-muted">
                  {wallStats.count} 本 · 每个城市一本 · 点开卡片翻页阅读
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <div className="flex items-center gap-0.5 rounded-full border border-travel-dim/40 bg-travel-cream/80 p-0.5 dark:border-shell-line dark:bg-shell-surface3/80">
                  <button
                    type="button"
                    onClick={() => changeWallView('wall')}
                    aria-pressed={wallView === 'wall'}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      wallView === 'wall'
                        ? 'bg-travel-sakura text-travel-ink shadow-sm dark:bg-travel-accent/20 dark:text-travel-bloom'
                        : 'text-travel-ink/70 hover:bg-travel-sakura/40 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />卡片墙
                  </button>
                  <button
                    type="button"
                    onClick={() => changeWallView('list')}
                    aria-pressed={wallView === 'list'}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      wallView === 'list'
                        ? 'bg-travel-sakura text-travel-ink shadow-sm dark:bg-travel-accent/20 dark:text-travel-bloom'
                        : 'text-travel-ink/70 hover:bg-travel-sakura/40 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />目录
                  </button>
                </div>
                <p className="text-xs text-travel-ink/55 dark:text-shell-muted">
                  共 {wallStats.days} 天 · {wallStats.photos} 张照片
                </p>
              </div>
            </div>

            {openError && (
              <div
                role="alert"
                className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-red-200/70 bg-red-50/80 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {openError}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenError('')}
                  aria-label="收起提示"
                  className="rounded-full p-1 transition-colors hover:bg-red-100 dark:hover:bg-red-500/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {wallView === 'wall' ? (
              <div className="album-scatter grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-3 xl:grid-cols-4">
                {(books || []).map((book, i) => (
                  <PostcardCard
                    key={book.bookKey || book.travelId}
                    book={book}
                    onOpen={() => openBookByKey(book)}
                    index={i}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-travel-dim/30 dark:divide-shell-line dark:border-shell-line overflow-hidden rounded-2xl border border-travel-dim/30 bg-[#FFFCF7] dark:bg-shell-surface shadow-[0_30px_50px_-34px_rgba(41,39,35,0.45)]">
                {(books || []).map((book) => {
                  const cover = book.coverThumb || book.coverPreview
                  const date = book.startDate
                    ? formatDotDate(book.startDate) +
                      (book.endDate && book.endDate !== book.startDate
                        ? ` ~ ${formatDotDate(book.endDate)}`
                        : '')
                    : ''
                  return (
                    <button
                      key={book.bookKey || book.travelId}
                      type="button"
                      onClick={() => openBookByKey(book)}
                      aria-label={`打开《${book.title}》旅行画册`}
                      className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-travel-sakura/25 sm:gap-4 sm:px-5"
                    >
                      <span className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-travel-dim/15 ring-1 ring-travel-dim/20">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="font-display text-lg font-semibold text-travel-ink/40">
                            {(book.title || '行').trim().charAt(0)}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-semibold text-travel-ink dark:text-shell-text">
                          {book.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-travel-ink/55 dark:text-shell-muted">
                          {book.location && <span>{book.location}</span>}
                          {date && <span className="tabular-nums">{date}</span>}
                        </span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1.5 text-xs text-travel-ink/50 sm:flex dark:text-shell-muted">
                        <BookOpen className="h-3.5 w-3.5" />
                        {book.dayCount} 章
                        <Camera className="ml-2 h-3.5 w-3.5" />
                        {book.photoCount} 图
                      </span>
                      {book.travelType && (
                        <span className="hidden shrink-0 rounded-full bg-travel-sakura/40 px-2 py-0.5 text-[11px] text-travel-ink/70 md:inline dark:bg-white/10 dark:text-shell-muted">
                          {TRAVEL_TYPE_LABELS[book.travelType] || book.travelType}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-travel-ink/35 transition-transform group-hover:translate-x-0.5 group-hover:text-travel-ink/70 dark:text-shell-faint dark:group-hover:text-shell-muted" />
                    </button>
                  )
                })}
              </div>
            )}

            {opening && (
              <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-travel-cream/40 dark:bg-shell-bg/40 backdrop-blur-[2px]">
                <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm text-travel-ink/70 dark:bg-shell-surface/90 dark:text-shell-text shadow-[0_10px_30px_-10px_rgba(41,39,35,0.35)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在翻开《{openingTitle}》...
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
