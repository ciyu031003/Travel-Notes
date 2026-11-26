'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { apiUrl } from '@/lib/api-base'
import { apiFetch } from '@/lib/client/api'
import {
  persistSoon,
  readPersistedCache,
  useIsomorphicLayoutEffect,
} from '@/lib/client/persisted-cache'
import type { AlbumModeKey } from '@/lib/album-modes'
import type { Book, BookSummary } from '@/components/album/travel-book/TravelBook'
import AlbumCard from './AlbumCard'
import WebAlbumStage from './WebAlbumStage'
import { IconArrowRight } from './Icons'
import './web-album.css'

/**
 * Web 相册 · 3D 卡片画册墙（桌面专属，≥1024px 由 app/album/page.tsx 挂载）
 * ============================================================================
 * 数据：完全复用现有 /api/travel-book
 *  · 列表：GET /api/travel-book（books 摘要）—— 与移动端 TravelBook 共享同一条
 *    apiFetch 内存缓存（30s TTL）+ localStorage 快照（24h），来回切页不重复拉；
 *  · 详情：GET /api/travel-book?key=… —— 只在真正翻开某本时按需拉取（悬停即预取）。
 * 视觉：Ink & Ivory（深色墨画布 / 浅色暖象牙），颜色与动效全部在 web-album.css。
 * 交互：卡片指针倾斜（≤10°）+ 跟随高光 + 微光扫过 → 点击进入沉浸式 3D 牌堆相册
 *      （大图 / 左右切换 / 键盘 ← → Esc / 扇形摊牌）。
 * 移动端完全不受影响：本组件只在 matchMedia('(min-width:1024px)') 命中时渲染。
 */

/** 列表内存缓存（与 TravelBook 同 key 同 TTL ⇒ 两者共享同一份缓存） */
const LIST_TTL_MS = 30_000
const LIST_CACHE_KEY = '/api/travel-book'
/** 列表 localStorage 快照新鲜期（24h）—— 冷启动首帧就有内容 */
const LIST_PERSIST_TTL_MS = 24 * 60 * 60 * 1000
/** 单本详情缓存（2min）：反复开合 / 悬停预取后打开几乎无等待 */
const DETAIL_TTL_MS = 120_000

function loadBookList() {
  return apiFetch<{ books?: BookSummary[] }>(apiUrl('/api/travel-book'), { ttlMs: LIST_TTL_MS })
}

function loadBookDetail(key: string) {
  return apiFetch<{ book?: Book }>(apiUrl('/api/travel-book?key=' + encodeURIComponent(key)), {
    ttlMs: DETAIL_TTL_MS,
  })
}

const MODE_LABELS: { key: AlbumModeKey; label: string; title: string }[] = [
  { key: 'book', label: '画册', title: '当前：旅行画册（桌面 3D 卡片墙）' },
  { key: 'pixel', label: '像素', title: '切换到像素桌面' },
  { key: 'space', label: '银河', title: '切换到银河空间' },
]

/** 2 列 / 3 列自适应：1 本居中大卡、2/4 本两列、3/5/6 本三列 */
function columnsFor(count: number): 1 | 2 | 3 {
  if (count <= 1) return 1
  if (count === 2 || count === 4) return 2
  return 3
}

export default function WebAlbumWall({
  onModeChange,
  initialBookKey,
}: {
  onModeChange: (mode: AlbumModeKey) => void
  /** 深链：/album?book=<bookKey> 直达某本画册（与移动端行为一致） */
  initialBookKey?: string | null
}) {
  const [books, setBooks] = useState<BookSummary[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const booksRef = useRef<BookSummary[] | null>(null)
  const requestRef = useRef(0)
  const prefetchedRef = useRef<Set<string>>(new Set())
  const aliveRef = useRef(true)

  const [openKey, setOpenKey] = useState<string | null>(null)
  const [openTitle, setOpenTitle] = useState('')
  const [detail, setDetail] = useState<Book | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const applyBooks = useCallback((next: BookSummary[] | null) => {
    booksRef.current = next
    setBooks(next)
  }, [])

  const totals = useMemo(() => {
    const list = books || []
    return {
      books: list.length,
      days: list.reduce((sum, b) => sum + (b.dayCount || 0), 0),
      photos: list.reduce((sum, b) => sum + (b.photoCount || 0), 0),
    }
  }, [books])

  const load = useCallback(() => {
    const rid = ++requestRef.current
    loadBookList()
      .then((json) => {
        if (rid !== requestRef.current) return
        const list = Array.isArray(json?.books) ? json.books : []
        applyBooks(list)
        setLoadError('')
        persistSoon(LIST_CACHE_KEY, list)
      })
      .catch(() => {
        if (rid !== requestRef.current) return
        if (booksRef.current !== null) return
        applyBooks([])
        setLoadError('旅行画册加载失败，请稍后重试。')
      })
  }, [applyBooks])

  /** 水合后、首帧前同步读本地快照（与 TravelBook 同一份 key，不做 hydration mismatch） */
  useIsomorphicLayoutEffect(() => {
    if (booksRef.current !== null) return
    const hit = readPersistedCache<BookSummary[]>(LIST_CACHE_KEY, { ttlMs: LIST_PERSIST_TTL_MS })
    if (hit && Array.isArray(hit.value)) applyBooks(hit.value)
  }, [applyBooks])

  useEffect(() => {
    aliveRef.current = true
    load()
    return () => {
      aliveRef.current = false
      requestRef.current += 1
    }
  }, [load])

  /** 意图预取：悬停 / 按下就先把详情取回（每个 key 只取一次） */
  const prefetch = useCallback((summary: BookSummary) => {
    const key = summary.bookKey
    if (!key || prefetchedRef.current.has(key)) return
    prefetchedRef.current.add(key)
    void loadBookDetail(key).catch(() => {})
  }, [])

  const openKeyRef = useRef(0)

  const openBook = useCallback((summary: BookSummary) => {
    const key = summary.bookKey
    const rid = ++openKeyRef.current
    setOpenKey(key)
    setOpenTitle(summary.title || '旅行画册')
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    loadBookDetail(key)
      .then((json) => {
        if (rid !== openKeyRef.current) return
        if (json?.book) setDetail(json.book)
        else setDetailError('画册打开失败，请稍后重试。')
      })
      .catch(() => {
        if (rid !== openKeyRef.current) return
        setDetailError('画册打开失败，请稍后重试。')
      })
      .finally(() => {
        if (rid === openKeyRef.current) setDetailLoading(false)
      })
  }, [])

  /** 深链：摘要列表就绪后按 key 直接翻开；摘要里没有时按 key 直拉全书 */
  const deepLinkDoneRef = useRef('')
  useEffect(() => {
    if (!initialBookKey || deepLinkDoneRef.current === initialBookKey) return
    if (books === null) return
    deepLinkDoneRef.current = initialBookKey
    const hit = books.find((b) => b.bookKey === initialBookKey)
    if (hit) {
      openBook(hit)
      return
    }
    const rid = ++openKeyRef.current
    setOpenKey(initialBookKey)
    setOpenTitle('旅行画册')
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    loadBookDetail(initialBookKey)
      .then((json) => {
        if (rid !== openKeyRef.current) return
        if (json?.book) {
          setDetail(json.book)
          setOpenTitle(json.book.title || '旅行画册')
        } else setDetailError('画册打开失败，请稍后重试。')
      })
      .catch(() => {
        if (rid !== openKeyRef.current) return
        setDetailError('画册打开失败，请稍后重试。')
      })
      .finally(() => {
        if (rid === openKeyRef.current) setDetailLoading(false)
      })
  }, [initialBookKey, books, openBook])

  const retryDetail = useCallback(() => {
    const key = openKey
    if (!key) return
    const summary = books?.find((b) => b.bookKey === key)
    if (summary) openBook(summary)
  }, [openKey, books, openBook])

  const closeStage = useCallback(() => {
    openKeyRef.current += 1
    setOpenKey(null)
    setDetail(null)
    setDetailLoading(false)
    setDetailError('')
    if (typeof window !== 'undefined' && window.location.search.includes('book=')) {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('book')
        window.history.replaceState(null, '', url.href)
      } catch {
        // 忽略
      }
    }
  }, [])

  const firstBook = books && books.length > 0 ? books[0] : null
  const cols = columnsFor(books?.length ?? 0)

  return (
    <div className="wa-root">
      <div className="wa-ambient" aria-hidden="true" />

      <div className="wa-shell">
        <header className="wa-hero">
          <div className="wa-hero-main">
            <p className="wa-eyebrow">Ink &amp; Ivory · 甜途</p>
            <h1 className="wa-hero-title font-display">
              旅行<em>画册</em>
            </h1>
            <p className="wa-hero-sub">海风、山径与深夜的街。每一段旅程都在这里被装订成一册。</p>
            <div className="wa-hero-actions">
              {firstBook ? (
                <button
                  type="button"
                  className="wa-btn wa-btn--primary"
                  onPointerEnter={() => prefetch(firstBook)}
                  onClick={() => openBook(firstBook)}
                >
                  翻开最近一本
                  <IconArrowRight size={17} />
                </button>
              ) : (
                <Link href="/travel" className="wa-btn wa-btn--primary">
                  去记录一次旅行
                  <IconArrowRight size={17} />
                </Link>
              )}
              <Link href="/travel" className="wa-btn wa-btn--ghost">
                旅行与足迹
              </Link>
            </div>
          </div>

          <div className="wa-hero-side">
            <div className="wa-panel">
              <div className="wa-panel-label">
                呈现方式
                <span>桌面专属</span>
              </div>
              <div className="wa-modes">
                {MODE_LABELS.map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    title={mode.title}
                    className="wa-mode"
                    aria-current={mode.key === 'book' ? 'true' : undefined}
                    onClick={() => {
                      if (mode.key !== 'book') onModeChange(mode.key)
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <ul className="wa-stats">
                <li className="wa-stat">
                  <b>{books === null ? '—' : totals.books}</b>
                  <i>本画册</i>
                </li>
                <li className="wa-stat">
                  <b>{books === null ? '—' : totals.days}</b>
                  <i>天旅途</i>
                </li>
                <li className="wa-stat">
                  <b>{books === null ? '—' : totals.photos}</b>
                  <i>张照片</i>
                </li>
              </ul>

              <div className="wa-panel-hint">
                <p className="wa-keys">
                  <kbd>←</kbd>
                  <kbd>→</kbd>
                  <span>切换</span>
                  <kbd>Esc</kbd>
                  <span>关闭</span>
                  <kbd>F</kbd>
                  <span>扇形摊牌</span>
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="wa-wall">
          {loadError ? (
            <div className="wa-error" role="alert">
              <p>
                <b>画册墙加载失败</b>
                {loadError}
              </p>
              <button type="button" className="wa-btn wa-btn--ghost" onClick={load}>
                重新加载
              </button>
            </div>
          ) : books === null ? (
            <>
              <div className="wa-wall-head">
                <h2 className="wa-wall-title font-display">正在装订画册</h2>
                <span className="wa-wall-count">读取中…</span>
              </div>
              <div className="wa-grid" data-cols="3" aria-hidden="true">
                <div className="wa-skeleton" />
                <div className="wa-skeleton" />
                <div className="wa-skeleton" />
              </div>
            </>
          ) : books.length === 0 ? (
            <div className="wa-empty">
              <div>
                <p className="wa-eyebrow">EMPTY SHELF</p>
                <h2 className="wa-empty-title font-display">
                  书架还是空的
                  <br />
                  第一本画册在等你
                </h2>
                <Link href="/travel" className="wa-btn wa-btn--primary">
                  新建一段旅程
                  <IconArrowRight size={17} />
                </Link>
              </div>
              <div className="wa-empty-art" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : (
            <>
              <div className="wa-wall-head">
                <h2 className="wa-wall-title font-display">全部画册</h2>
                <span className="wa-wall-count">
                  {totals.books} 本 · {totals.days} 天 · {totals.photos} 张照片
                </span>
              </div>
              <div className="wa-grid" data-cols={String(cols)}>
                {books.map((book, i) => (
                  <AlbumCard
                    key={book.bookKey || 'book-' + i}
                    book={book}
                    index={i}
                    onOpen={openBook}
                    onIntent={prefetch}
                  />
                ))}
              </div>
            </>
          )}
        </main>

        <footer className="wa-foot">
          <span>甜途 · 旅行记忆空间</span>
        </footer>
      </div>

      {/* 沉浸式相册用 portal 挂到 body：fixed 全屏定位不能被 .web-content-offset 的 overflow clip 裁切 */}
      {openKey && typeof document !== 'undefined'
        ? createPortal(
            <WebAlbumStage
              book={detail}
              fallbackTitle={openTitle}
              loading={detailLoading}
              error={detailError}
              onClose={closeStage}
              onRetry={retryDetail}
            />,
            document.body,
          )
        : null}
    </div>
  )
}