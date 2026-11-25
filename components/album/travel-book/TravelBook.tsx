'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
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
import { apiFetch } from '@/lib/client/api'
import { Icon } from '@/components/mobile/Icon'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import TiltCoverCard from '@/components/album/thumb/TiltCoverCard'
import { ALBUM_MODES, type AlbumModeKey } from '@/lib/album-modes'
import { formatDotDate } from '@/lib/modules/album/presentation'
import {
  readPersistedCache,
  persistSoon,
  useIsomorphicLayoutEffect,
} from '@/lib/client/persisted-cache'

/**
 * 画册阅读器按需加载（移动端性能专项 D，2026-11-21）
 * ---------------------------------------------------------------------------
 * BookReader 是相册区最重的模块：page-flip 运行时 + 3 套主题 + 页模板 + 排版/分页。
 * 它此前**静态**引入，于是「打开相册墙」这个动作要先把阅读器代码一起下载/编译，
 * 用户却可能一本都不点开 —— 真机反馈的「打开相册特别卡」很大一部分来自这里。
 *
 * 为什么不用 next/dynamic：dynamic() 内部是 React.lazy，首次渲染一定会先挂起、等模块
 * 就绪后再由 React 调度一次重试 —— 即使代码块早已预取，实测首开仍会多出约 250~300ms
 * 的「空等」窗口（392→398ms vs 静态导入 131ms）。这里改成手写 loader：墙渲染后就把
 * 模块取回来并存进 state，用户点击时已经是**普通同步组件**，首开回到静态导入的水平，
 * 同时首屏仍然不背负阅读器体积。
 */
type ReaderComponent = ComponentType<{ book: Book; onBack: () => void }>

/** 模块级 Promise：同一次会话内只 import 一次（并发点击共享） */
let readerModulePromise: Promise<ReaderComponent> | null = null

function loadReaderModule(): Promise<ReaderComponent> {
  if (!readerModulePromise) {
    readerModulePromise = import('./BookReader').then((m) => m.default as ReaderComponent)
  }
  return readerModulePromise
}

type Mode = AlbumModeKey

const WALL_VIEW_KEY = 'album-wall-view'
type WallView = 'wall' | 'list'

/** 打开画册前保存墙位，返回时恢复（session 级，刷新作废） */
const WALL_SCROLL_KEY = 'album-wall-scroll-y'

/** 画册墙摘要缓存（30s）：/album ⇄ 首页来回切时不重复拉目录，回墙即时渲染 */
const BOOK_LIST_TTL_MS = 30_000

/**
 * 画册目录的**持久化**快照（E1，2026-11-21）
 * ------------------------------------------------
 * 相册页默认就是 book 模式，墙上陈列的全部是 /api/travel-book 的摘要；没有本地数据时
 * 打开相册要先看「正在翻开旅行画册…」等一个往返（中端机 4G + 500ms 接口 ≈ 1s 起）。
 * 这里把目录落 localStorage，挂载时在水合后、首帧绘制前同步读回来 —— 画册墙首开不空转。
 *
 * 与阅读器详情缓存（BOOK_DETAIL_TTL_MS，内存 2min）互不影响：那本仍走 apiFetch。
 * 语义约束：**没有快照时必须还是原来的 loading 流程**（books 保持 null → 转圈 → 结果/错误）。
 */
const BOOK_LIST_CACHE_KEY = '/api/travel-book'
/** 目录快照新鲜期：24h。内容变化由挂载时的 load() 校准 */
const BOOK_LIST_PERSIST_TTL_MS = 24 * 60 * 60 * 1000
/** 单本书详情缓存（2min）：同一本书反复开合、或按下时已预取，打开接近即时 */
const BOOK_DETAIL_TTL_MS = 120_000

function loadBookList() {
  return apiFetch<{ books?: BookSummary[] }>(apiUrl('/api/travel-book'), { ttlMs: BOOK_LIST_TTL_MS })
}

function loadBookDetail(key: string) {
  return apiFetch<{ book?: Book }>(
    apiUrl('/api/travel-book?key=' + encodeURIComponent(key)),
    { ttlMs: BOOK_DETAIL_TTL_MS },
  )
}

/** 阅读器加载占位：与 BookReader 根容器同底色/同层级，避免打开时闪白与高度跳变 */
function ReaderLoading() {
  return (
    <div className="fixed inset-0 z-[105] flex flex-col items-center justify-center gap-3 bg-travel-cream dark:bg-shell-bg">
      <Icon icon={Loader2} size="lg" className="animate-spin text-[var(--m-accent)]" />
      <p className="text-[13px] font-semibold text-[var(--m-muted)]">正在翻开画册…</p>
    </div>
  )
}

/** 空闲调度：WKWebView/Safari 无 requestIdleCallback，退化到 setTimeout */
function onIdle(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const w = window as Window & {
    requestIdleCallback?: (fn: () => void, opts?: { timeout?: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(cb, { timeout: 2000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(cb, 350)
  return () => window.clearTimeout(id)
}

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
  /** 与 state 同步的最近目录：load 失败时据此判断「是不是已经有本地快照在展示」 */
  const booksRef = useRef<BookSummary[] | null>(null)
  const applyBooks = useCallback((next: BookSummary[] | null) => {
    booksRef.current = next
    setBooks(next)
  }, [])
  const [loadError, setLoadError] = useState('')
  const [openError, setOpenError] = useState('')
  const [openBook, setOpenBook] = useState<Book | null>(null)
  const [opening, setOpening] = useState(false)
  const [openingTitle, setOpeningTitle] = useState('')
  const [wallView, setWallView] = useState<WallView>('wall')
  /** 已就绪的阅读器组件（预热完成后为同步组件；未就绪时先显示 ReaderLoading） */
  const [ReaderScreen, setReaderScreen] = useState<ReaderComponent | null>(null)
  /** 请求代次：卸载/重载后忽略旧响应（原实现用 AbortController，改为共享缓存后不需要真的中断） */
  const requestIdRef = useRef(0)
  /** 已预取过的画册 key（每个只预取一次） */
  const prefetchedBooksRef = useRef<Set<string>>(new Set())
  const readerChunkWarmedRef = useRef(false)
  /** 组件是否仍在树上：预热 Promise 回来时避免更新已卸载组件 */
  const aliveRef = useRef(true)

  const wallStats = useMemo(() => {
    const list = books || []
    return {
      count: list.length,
      days: list.reduce((sum, book) => sum + (book.dayCount || 0), 0),
      photos: list.reduce((sum, book) => sum + (book.photoCount || 0), 0),
    }
  }, [books])

  /**
   * 预取阅读器代码块（画册墙渲染后立即、以及悬停/按下卡片时）——只拉 JS，不发请求。
   * 拿到模块后存进 state：点击时 ReaderScreen 已是普通组件，直接同步渲染。
   */
  const prefetchReader = useCallback(() => {
    if (readerChunkWarmedRef.current) return
    readerChunkWarmedRef.current = true
    loadReaderModule()
      .then((comp) => {
        if (aliveRef.current) setReaderScreen(() => comp)
      })
      .catch(() => {
        // 拉取失败：允许下次重试，点击时仍会再触发一次加载
        readerChunkWarmedRef.current = false
      })
  }, [])

  /**
   * 按下卡片时的意图预取：这一步把「点开画册」的等待提前到手指按下到抬起之间。
   * 命中 apiFetch 的 ttl 内存缓存后，openBookByKey 会立刻拿到数据直接渲染阅读器。
   */
  const prefetchBook = useCallback((summary: BookSummary) => {
    prefetchReader()
    const key = summary.bookKey
    if (!key || prefetchedBooksRef.current.has(key)) return
    prefetchedBooksRef.current.add(key)
    void loadBookDetail(key).catch(() => {})
  }, [prefetchReader])

  const openBookByKey = useCallback((summary: BookSummary) => {
    prefetchReader()
    try {
      sessionStorage.setItem(WALL_SCROLL_KEY, String(window.scrollY || 0))
    } catch {
      // 忽略
    }
    const requestId = ++requestIdRef.current
    setOpening(true)
    setOpeningTitle(summary.title || '旅行画册')
    setOpenError('')
    // 共享缓存取数：命中 TTL 快照时同步返回（预取过 → 打开几乎无等待），
    // 同一本书并发点击也只发一次网络往返（apiFetch 无 signal 时自动去重）。
    loadBookDetail(summary.bookKey)
      .then((j) => {
        if (requestId !== requestIdRef.current) return
        if (j?.book) {
          setOpenBook(j.book)
        } else {
          setOpenError('画册打开失败，请稍后重试。')
        }
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setOpenError('画册打开失败，请稍后重试。')
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setOpening(false)
      })
  }, [prefetchReader])

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
      const requestId = ++requestIdRef.current
      setOpening(true)
      setOpeningTitle('旅行画册')
      setOpenError('')
      loadBookDetail(initialBookKey)
        .then((j) => {
          if (requestId !== requestIdRef.current) return
          if (j?.book) setOpenBook(j.book)
          else setOpenError('画册打开失败，请稍后重试。')
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return
          setOpenError('画册打开失败，请稍后重试。')
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setOpening(false)
        })
    }
  }, [initialBookKey, books, openBookByKey])

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    // 共享缓存取数（30s TTL + 并发去重）：/album 来回切不重复拉目录，返回墙上时即时渲染。
    loadBookList()
      .then((j) => {
        if (requestId !== requestIdRef.current) return
        const list: BookSummary[] = Array.isArray(j?.books) ? j.books : []
        applyBooks(list)
        setLoadError('')
        // E1：落盘供下次启动同步水合（推迟到下一帧之后，序列化不卡渲染帧）
        persistSoon(BOOK_LIST_CACHE_KEY, list)
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        // E1 本地优先：已有本地快照在展示时，一次网络失败不把画册墙清空成错误页。
        // （没有快照时行为不变：books 置空 + 错误提示 + 重试按钮）
        if (booksRef.current !== null) return
        applyBooks([])
        setLoadError('旅行画册加载失败，请稍后重试。')
      })
  }, [applyBooks])

  /**
   * 水合后、首次绘制前：同步读画册目录的 localStorage 快照。
   *
   * 为什么放在 layout effect 而不是 useState 初始化器：服务端/静态导出的首帧 HTML 是
   * 「正在翻开旅行画册…」的转圈态，渲染期就读快照会造成 hydration mismatch。
   * 没有快照时这里什么都不做 —— books 保持 null，后续仍是原来的 loading → 结果/错误流程。
   */
  useIsomorphicLayoutEffect(() => {
    if (booksRef.current !== null) return
    const hit = readPersistedCache<BookSummary[]>(BOOK_LIST_CACHE_KEY, { ttlMs: BOOK_LIST_PERSIST_TTL_MS })
    if (!hit || !Array.isArray(hit.value)) return
    applyBooks(hit.value)
  }, [applyBooks])

  useEffect(() => {
    aliveRef.current = true
    load()
    // 卸载只是忽略后续响应：请求本身是共享缓存里的，不中断（结果留给下次进页面直接用）
    return () => {
      aliveRef.current = false
      requestIdRef.current += 1
    }
  }, [load])

  /**
   * 画册墙数据一到，就预热「点开就会用到」的东西（移动端性能专项 D）。
   *
   * ① 阅读器代码块：BookReader 改成本页动态导入后，若等到点击才拉，「动态边界解析 +
   *    首次渲染」叠在一起会让首开从 ~200ms 掉到 ~400ms（实测）。这里在墙渲染后**立即**
   *    预取该 chunk（13KB gz）：点击时 React 侧已是「模块已就绪」，首开回到静态导入的水平。
   * ② 第一本书的详情：hero「翻开画册」是主 CTA，用户大概率点它；预取后点开只剩渲染时间。
   *    这步放空闲做（requestIdleCallback，退化 setTimeout），不抢画册墙首屏与 LCP。
   */
  useEffect(() => {
    if (!books || books.length === 0) return
    prefetchReader()
    return onIdle(() => prefetchBook(books[0]))
  }, [books, prefetchReader, prefetchBook])

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
    applyBooks(null)
    setLoadError('')
    load()
  }, [load, applyBooks])

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
    return ReaderScreen ? <ReaderScreen book={openBook} onBack={closeReader} /> : <ReaderLoading />
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
            <p className="m2-eyebrow">甜途 · 旅行画册</p>
            <h1 className="v6-album-title mt-0.5 truncate text-[24px] font-bold tracking-[-0.03em] text-[var(--m-text)]">旅行画册</h1>
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

        {/* 三种既有呈现模式：书页 / 银河 / 像素。只换入口样式，不改变切换逻辑。
            2026-11-24：外壳换成液态玻璃（shadcn @aceternity/liquid-glass），
            选中块的实色也改成磨砂玻璃片，与底部导航/分段控件同一套视觉语言。 */}
        <LiquidGlass
          radius={16}
          bevelDepth={10}
          scale={22}
          aberration={2.5}
          frost={0.3}
          tint={0.2}
          idleOnly
          className="mt-3 ring-1 ring-[var(--m-line)]"
          contentClassName="relative"
        >
        <div className="m2-seg m2-seg--glass">
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
        </LiquidGlass>
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
                onPointerEnter={prefetchReader}
                onPointerDown={() => prefetchBook(firstBook)}
                onTouchStart={() => prefetchBook(firstBook)}
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
                      // 封面卡「手指捏住」3D 倾斜（T2）：按住拖动跟随倾斜 + 高光跟随，
                      // 位移 < 6px 才当点击打开画册；prefetch 入口与拆出前一致。
                      <TiltCoverCard
                        key={book.bookKey || book.travelId}
                        className="m2-book-cover block text-left"
                        ariaLabel={`打开《${book.title}》旅行画册`}
                        onOpen={() => openBookByKey(book)}
                        onPressStart={() => prefetchBook(book)}
                        onHoverStart={prefetchReader}
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
                      </TiltCoverCard>
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
                        onPointerEnter={prefetchReader}
                        onPointerDown={() => prefetchBook(book)}
                        onTouchStart={() => prefetchBook(book)}
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