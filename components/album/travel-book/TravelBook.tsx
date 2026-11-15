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
  X,
} from 'lucide-react'
import { apiUrl } from '@/lib/api-base'
import { Icon } from '@/components/mobile/Icon'
import { ALBUM_MODES, type AlbumModeKey } from '@/lib/album-modes'
import { formatDotDate } from '@/lib/modules/album/presentation'
import BookReader from './BookReader'

type Mode = AlbumModeKey

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

const firstBook = books && books.length > 0 ? books[0] : null

  return (
    <div className="m2-screen min-h-dvh">
      <header className="m2-gutter sticky top-0 z-40 border-b border-[var(--m-line)] bg-[color-mix(in_srgb,var(--m-bg)_88%,transparent)] pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="返回首页"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-text)] shadow-[var(--m-shadow-l1)] transition active:scale-95"
          >
            <Icon icon={ArrowLeft} size="md" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="m2-eyebrow">TRAVEL BOOKS</p>
            <h1 className="mt-0.5 truncate text-[24px] font-bold tracking-[-0.03em] text-[var(--m-text)]">旅行画册</h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] p-1 shadow-[var(--m-shadow-l1)]">
            <button
              type="button"
              onClick={() => changeWallView('wall')}
              aria-pressed={wallView === 'wall'}
              aria-label="卡片墙"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                wallView === 'wall' ? 'bg-[var(--m-tone-pink)] text-[var(--m-accent-strong)]' : 'text-[var(--m-faint)]'
              }`}
            >
              <Icon icon={LayoutGrid} size="sm" />
            </button>
            <button
              type="button"
              onClick={() => changeWallView('list')}
              aria-pressed={wallView === 'list'}
              aria-label="目录列表"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                wallView === 'list' ? 'bg-[var(--m-tone-pink)] text-[var(--m-accent-strong)]' : 'text-[var(--m-faint)]'
              }`}
            >
              <Icon icon={List} size="sm" />
            </button>
          </div>
        </div>

        {/* 三种既有呈现模式：书页 / 银河 / 像素。只换入口样式，不改变切换逻辑 */}
        <div className="m2-seg mt-3">
          {ALBUM_MODES.map((m) => {
            const isCurrent = m.key === 'book'
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => !isCurrent && onModeChange(m.key)}
                aria-current={isCurrent ? 'true' : undefined}
                className={`m2-seg-btn inline-flex items-center justify-center gap-1.5 ${
                  isCurrent ? 'is-active' : ''
                }`}
              >
                <Icon icon={m.icon} size="sm" />
                {m.label}
              </button>
            )
          })}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[430px] px-[18px] pb-10 pt-4">
        {books === null && !loadError ? (
          <div className="m2-card flex items-center justify-center gap-2.5 px-5 py-16 text-[13px] text-[var(--m-muted)]">
            <Icon icon={Loader2} size="md" className="animate-spin text-[var(--m-accent)]" />
            正在翻开旅行画册…
          </div>
        ) : loadError ? (
          <div className="m2-card px-6 py-12 text-center">
            <span className="m2-icon-box m2-tone-peach mx-auto h-14 w-14">
              <Icon icon={AlertCircle} size="lg" />
            </span>
            <p className="mt-3 text-[14px] font-semibold text-[var(--m-text)]">{loadError}</p>
            <button
              type="button"
              onClick={retryLoad}
              className="m-btn m-btn-primary m-btn-sm mt-4 px-5"
            >
              重新加载
            </button>
          </div>
        ) : books && books.length === 0 ? (
          <div className="m2-card px-6 py-12 text-center">
            <span className="m2-icon-box m2-tone-lavender mx-auto h-14 w-14">
              <Icon icon={Camera} size="lg" />
            </span>
            <p className="mt-3 text-[15px] font-bold text-[var(--m-text)]">还没有旅行画册</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--m-muted)]">
              去记录一次旅行，走过的城市会自动变成一本画册。
            </p>
          </div>
        ) : (
          <>
            {openError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-[12px] bg-[color-mix(in_srgb,var(--danger-soft)_10%,white)] px-3.5 py-3 text-[12px] text-[var(--danger-soft)]"
              >
                <span className="flex items-center gap-2">
                  <Icon icon={AlertCircle} size="sm" className="shrink-0" />
                  {openError}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenError('')}
                  aria-label="收起提示"
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                >
                  <Icon icon={X} size="sm" />
                </button>
              </div>
            )}

            {wallView === 'wall' && firstBook && (
              <button
                type="button"
                onClick={() => openBookByKey(firstBook)}
                className="m2-hero-card block w-full text-left"
                aria-label={`打开《${firstBook.title}》旅行画册`}
              >
                <div className="relative h-[250px]">
                  {firstBook.coverThumb || firstBook.coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firstBook.coverThumb || firstBook.coverPreview || ''}
                      alt={firstBook.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--m-grad-hero)]" />
                  )}
                  <div className="m2-hero-shade" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <p className="text-[11px] font-semibold text-white/90">
                      {firstBook.startDate ? formatDotDate(firstBook.startDate) : 'TRAVEL BOOK'}
                    </p>
                    <h2 className="mt-1 line-clamp-2 text-[23px] font-bold leading-7 tracking-[-0.02em]">
                      {firstBook.title}
                    </h2>
                    <p className="mt-1 text-[11px] text-white/85">
                      {firstBook.dayCount} 天 · {firstBook.photoCount} 张照片
                      {firstBook.location ? ` · ${firstBook.location}` : ''}
                    </p>
                    <span className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-bold text-[var(--m-accent-strong)] shadow-sm">
                      <Icon icon={BookOpen} size="sm" />
                      翻开画册
                    </span>
                  </div>
                </div>
              </button>
            )}

            <section className={wallView === 'wall' ? 'mt-6' : 'mt-1'}>
              <div className="m2-section-head">
                <h2 className="m2-section-title">{wallView === 'wall' ? '全部画册' : '画册目录'}</h2>
                <span className="text-[11px] text-[var(--m-faint)]">
                  {wallStats.count} 本 · {wallStats.days} 天 · {wallStats.photos} 张
                </span>
              </div>

              {wallView === 'wall' ? (
                <div className="grid grid-cols-2 gap-4">
                  {(books || []).map((book) => {
                    const cover = book.coverThumb || book.coverPreview
                    return (
                      <button
                        key={book.bookKey || book.travelId}
                        type="button"
                        onClick={() => openBookByKey(book)}
                        className="m2-book-cover block text-left shadow-[var(--m-shadow-l2)] transition active:scale-[0.985]"
                        aria-label={`打开《${book.title}》旅行画册`}
                      >
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center bg-[var(--m-grad-hero)] font-display text-4xl font-bold text-[var(--m-accent-strong)]">
                            {(book.title || '行').trim().charAt(0)}
                          </span>
                        )}
                        <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(58,20,36,0.78),rgba(58,20,36,0.02)_62%)]" aria-hidden="true" />
                        <span className="absolute inset-x-0 bottom-0 z-[3] p-3 text-white">
                          <span className="line-clamp-1 text-[13px] font-bold">{book.title}</span>
                          <span className="mt-0.5 block text-[10px] text-white/85">
                            {book.startDate ? formatDotDate(book.startDate) : '待记录'} · {book.photoCount} 张
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="m2-list-group">
                  {(books || []).map((book) => {
                    const cover = book.coverThumb || book.coverPreview
                    return (
                      <button
                        key={book.bookKey || book.travelId}
                        type="button"
                        onClick={() => openBookByKey(book)}
                        className="m2-list-row w-full text-left"
                        aria-label={`打开《${book.title}》旅行画册`}
                      >
                        <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-[6px] bg-[var(--m-surface-2)]">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-[var(--m-accent-strong)]">
                              {(book.title || '行').trim().charAt(0)}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold text-[var(--m-text)]">{book.title}</span>
                          <span className="mt-1 block truncate text-[11px] text-[var(--m-muted)]">
                            {book.location ? `${book.location} · ` : ''}
                            {book.dayCount} 章 · {book.photoCount} 图
                          </span>
                        </span>
                        <Icon icon={ChevronRight} size="sm" className="shrink-0 text-[var(--m-faint)]" />
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            {opening && (
              <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(255,246,248,0.55)] backdrop-blur-[2px]">
                <div className="flex items-center gap-2 rounded-full bg-[var(--m-surface-solid)] px-4 py-2.5 text-[12px] font-semibold text-[var(--m-text)] shadow-[var(--m-shadow-l2)]">
                  <Icon icon={Loader2} size="sm" className="animate-spin text-[var(--m-accent)]" />
                  正在翻开《{openingTitle}》…
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
