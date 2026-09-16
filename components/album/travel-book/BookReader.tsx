'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, List, Palette, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import type { Book } from './TravelBook'
import ArtFlipBook, { type ArtFlipBookHandle } from '../reader/ArtFlipBook'
import { BookPageBody } from '../book/BookPageBody'
import { useBookTheme, useBookTier, themeStyle } from '../book/themes/runtime'
import { BOOK_THEME_METAS } from '../book/themes/types'
import { preloadAdjacentSpreads } from '@/lib/modules/album/book/preload'
import { composeFromSourceBook } from '@/lib/modules/album/book/mapper'
import { paginate } from '@/lib/modules/album/book/paginate'
import type { BookSpread } from '@/lib/modules/album/book/types'

/**
 * 旅行画册阅读器（Album 2.0 M1/M2/M3）
 *
 * 数据流（单向、纯函数）：
 *   Book(API) → composeFromSourceBook → BookPage[] → paginate(mode) → BookSpread[]
 *               └ 纯编排（评分/取舍/节奏）        └ 纯对开编排（出血展开/落单处理）
 *
 * 【性能契约】页面集合只随 (book, isWide) 变化——**图片加载不会改变它**。
 * page-flip 实例只在真实 DOM 挂载时创建一次，之后不再 updateFromHtml。
 * 布局模式切换（<768px ↔ ≥768px）走 mountKey，重建整本书（必要成本，且可观测）。
 *
 * 【主题契约】主题（画报/胶片/手记）与视觉档（standard/lite/reduced）**只影响视觉**：
 * 不改变 pages / spreads 的数量与顺序，因此**切换主题不重建整本书**（只重渲染页内容）。
 */

/** 双页展开的最小视口宽度（与 CSS `md` 断点一致） */
const DUAL_PAGE_MIN_WIDTH = 768
/** 跳转后对"过渡位置回报"的免疫窗口（≈ 一次翻页动画 + 余量） */
const FLIP_SETTLE_MS = 900

export default function BookReader({ book, onBack }: { book: Book; onBack: () => void }) {
  const [isWide, setIsWide] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DUAL_PAGE_MIN_WIDTH}px)`)
    const sync = () => setIsWide(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      mq.removeEventListener?.('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  // 主题（用户审美，持久化）与视觉档（设备能力 / prefers-reduced-motion）
  const { themeKey, theme, setThemeKey } = useBookTheme()
  const { tier, profile } = useBookTier()
  const [showThemes, setShowThemes] = useState(false)

  // 编排：只随 book 变化（与视口无关，保证逻辑页稳定）
  const composed = useMemo(() => composeFromSourceBook(book), [book])
  // 对开：随布局模式变化
  const spreads = useMemo(
    () => paginate(composed.pages, isWide ? 'dual' : 'single'),
    [composed.pages, isWide],
  )

  // 各章引导页所属的跨页下标（章节直达用）
  const chapterStarts = useMemo(() => {
    const starts: { dayIndex: number; title: string; spreadIndex: number }[] = []
    spreads.forEach((spread, i) => {
      for (const page of [spread.left, spread.right]) {
        if (page?.type === 'DAY_OPENING' && page.dayIndex !== null) {
          starts.push({ dayIndex: page.dayIndex, title: page.title || `DAY ${page.dayIndex}`, spreadIndex: i })
        }
      }
    })
    return starts
  }, [spreads])

  const artFlipRef = useRef<ArtFlipBookHandle>(null)
  const [spreadIndex, setSpreadIndex] = useState(0)
  /** page-flip 实例创建次数：性能契约的可观测断言点（应为 1；仅布局模式切换时 +1） */
  const mountCountRef = useRef(0)
  /**
   * 跳转请求的期望对开序号。
   * page-flip 的 flip 事件可能比跳转请求晚到（且落在过渡位置），
   * 因此跳转后一小段时间内以「请求值」为准，超时后才交还给库上报值。
   */
  const pendingSpreadRef = useRef<{ index: number; at: number } | null>(null)

  // 每个跨页渲染成一张「对开 sheet」：左页 + 右页（单页模式下右页即全部）
  // 依赖里含 themeKey：换主题只重渲染页内容，**不**触发 ArtFlipBook 重建（mountKey 未变）
  const sheets = useMemo(
    () => spreads.map((spread: BookSpread) => (
      <div key={spread.id} className={`book-sheet${spread.left ? '' : ' book-sheet--single'}`}>
        {spread.left && (
          <div className="book-sheet-side book-sheet-side--left">
            <BookPageBody page={spread.left} themeKey={themeKey} />
          </div>
        )}
        <div className="book-sheet-side book-sheet-side--right">
          <BookPageBody page={spread.right} themeKey={themeKey} />
        </div>
      </div>
    )),
    [spreads, themeKey],
  )

  const handleRuntimeMount = useCallback(() => {
    mountCountRef.current += 1
  }, [])

  /**
   * 跳转到指定对开。
   *
   * 【为什么要把"请求值"锁一小段时间】page-flip 的跨对开跳转是带动画的异步操作，
   * 期间会先冒出过渡位置的 `flip` 事件。若无条件采信事件，页码指示会被过渡值覆盖
   * （现象：按 Home 回封面，指示却停在 03）。
   * 策略：跳转时立刻写入期望值，并对后续事件做一个短窗口（≈ 一次翻页时长）的免疫；
   * 窗口结束后仍以库上报值为准，保证用户手动翻页/拖拽的显示始终正确。
   */
  const goToSpread = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, spreads.length - 1))
    pendingSpreadRef.current = { index: clamped, at: Date.now() }
    setSpreadIndex(clamped)
    artFlipRef.current?.turnToSpread(clamped)
  }, [spreads.length])

  const handlePageChange = useCallback((_pageIndex: number, reportedSpread?: number) => {
    if (typeof reportedSpread !== 'number') return
    const pending = pendingSpreadRef.current
    if (pending) {
      const settled = pending.index === reportedSpread
      const expired = Date.now() - pending.at > FLIP_SETTLE_MS
      if (settled || expired) {
        pendingSpreadRef.current = null
      } else {
        // 跳转动画进行中：忽略过渡位置的回报，保持期望值
        return
      }
    }
    setSpreadIndex(reportedSpread)
  }, [])

  // 邻页预热：当前跨页 ±1 的图离屏 decode()，翻到时已是解码好的位图（不拉全书）
  useEffect(() => {
    preloadAdjacentSpreads(spreads, spreadIndex)
  }, [spreads, spreadIndex])

  // 挂载：把阅读器顶到内容起点，避免从墙上点击后继续停在旧位置造成视觉错位
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  // 阅读器容器尺寸：iOS 工具栏收起/展开、横竖屏切换都会改变可用高度。
  // CSS 用 100dvh 已经能跟上一部分，但 art-flip-rig 的 min/max 与 page-flip 的
  // autoSize 重新测量需要一个显式信号 —— 用 ResizeObserver 同步一个 data 标记。
  const rigRef = useRef<HTMLDivElement | null>(null)
  const [rigVersion, setRigVersion] = useState(0)
  useEffect(() => {
    const el = rigRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let last = { w: 0, h: 0 }
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      // 忽略亚像素抖动，避免 page-flip 反复重排
      if (Math.abs(box.width - last.w) < 2 && Math.abs(box.height - last.h) < 2) return
      last = { w: box.width, h: box.height }
      setRigVersion((v) => v + 1)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入框 / 按钮获得焦点时交还给原生行为（如空格触发按钮点击），避免重复翻页
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement ||
          t instanceof HTMLButtonElement ||
          t.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        artFlipRef.current?.flipNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        artFlipRef.current?.flipPrev()
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToSpread(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        goToSpread(spreads.length - 1)
      } else if (e.key === 'Escape') {
        if (showThemes) setShowThemes(false)
        else onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, spreads.length, showThemes, goToSpread])

  const navBtn = 'inline-flex items-center gap-1 rounded-full bg-travel-sakura/70 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura dark:bg-white/10 dark:text-shell-text dark:hover:bg-white/20'
  const isCover = spreadIndex === 0
  const total = spreads.length
  const currentLabel = `${String(spreadIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
  const currentThemeMeta = BOOK_THEME_METAS.find((m) => m.key === themeKey) ?? BOOK_THEME_METAS[0]

  return (
    <div
      className="book-reader fixed inset-0 z-[105] flex flex-col bg-travel-cream dark:bg-shell-bg"
      style={themeStyle(theme)}
      data-book-theme={theme.key}
      data-book-tier={tier}
    >
      <header className="flex items-center justify-between gap-2 border-b border-travel-dim/40 px-3 py-2.5 sm:px-4 dark:border-shell-line">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura dark:bg-white/10 dark:text-shell-text dark:hover:bg-white/20"
        >
          <Icon icon={ChevronLeft} size="sm" />
          <span className="hidden sm:inline">返回画册墙</span>
        </button>
        <div className="flex min-w-0 items-center gap-1.5 font-display text-sm font-semibold text-travel-ink dark:text-shell-text">
          <Icon icon={BookOpen} size="sm" className="shrink-0 text-travel-bloom" />
          <span className="truncate">{book.title}</span>
        </div>
        <div className="relative flex shrink-0 items-center gap-1">
          {/* 主题切换：只改视觉，不重建整本书（主题契约，见文件头） */}
          <button
            type="button"
            onClick={() => setShowThemes((v) => !v)}
            aria-expanded={showThemes}
            aria-haspopup="menu"
            title={`画册主题：${currentThemeMeta.label} · ${currentThemeMeta.description}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura dark:bg-white/10 dark:text-shell-text dark:hover:bg-white/20"
          >
            <Icon icon={Palette} size="sm" />
            <span className="hidden sm:inline">{currentThemeMeta.label}</span>
          </button>
          <button
            type="button"
            onClick={onBack}
            aria-label="关闭"
            className="rounded-full p-2 text-travel-ink/60 transition-colors hover:bg-travel-sakura/40 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text"
          >
            <Icon icon={X} size="sm" />
          </button>
          {showThemes && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowThemes(false)} />
              <div
                role="menu"
                aria-label="画册主题"
                className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-travel-dim/50 bg-travel-cream/95 p-1 shadow-[0_18px_40px_-18px_rgba(90,60,40,0.5)] backdrop-blur dark:border-shell-line dark:bg-shell-surface/95"
              >
                {BOOK_THEME_METAS.map((meta) => {
                  const active = meta.key === themeKey
                  return (
                    <button
                      key={meta.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => { setThemeKey(meta.key); setShowThemes(false) }}
                      className={`flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left transition-colors ${
                        active
                          ? 'bg-travel-sakura/70 dark:bg-travel-accent/20'
                          : 'hover:bg-travel-sakura/40 dark:hover:bg-white/10'
                      }`}
                    >
                      <span className="text-xs font-semibold text-travel-ink dark:text-shell-text">{meta.label}</span>
                      <span className="text-[11px] leading-snug text-travel-ink/60 dark:text-shell-muted">{meta.description}</span>
                    </button>
                  )
                })}
                <p className="px-3 pb-1 pt-2 text-[11px] leading-snug text-travel-ink/45 dark:text-shell-faint">
                  主题只改变版式外观，不影响画册页数与顺序。
                </p>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-2 py-2 sm:px-4 sm:py-3">
        <div
          ref={rigRef}
          data-rig-version={rigVersion}
          className={`art-flip-rig${isWide ? '' : ' art-flip-rig--single'}`}
        >
          {/* mountKey 由 (bookKey, 布局模式) 组成：只有真正换了页面集合才重建整本书。
              主题与视觉档都不在 mountKey 里 —— 换主题不重建。 */}
          <ArtFlipBook
            key={`${book.bookKey || book.travelId}:${isWide ? 'dual' : 'single'}`}
            mountKey={`${book.bookKey || book.travelId}:${isWide ? 'dual' : 'single'}`}
            ref={artFlipRef}
            pages={sheets}
            onPageChange={handlePageChange}
            currentPage={spreadIndex}
            portrait={!isWide}
            flippingTime={profile.flippingTime}
            drawShadow={profile.drawShadow}
            onRuntimeMount={handleRuntimeMount}
          />
        </div>
        {chapterStarts.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center">
            <div
              role="group"
              aria-label="章节直达"
              className={`pointer-events-auto flex max-w-[min(92%,720px)] items-center gap-1 overflow-x-auto rounded-full border border-travel-dim/50 bg-travel-cream/90 px-2 py-1.5 shadow-[0_8px_24px_-12px_rgba(90,60,40,0.35)] backdrop-blur transition-opacity dark:border-shell-line dark:bg-shell-surface/90 dark:shadow-black/40 ${isCover ? '' : 'opacity-0 focus-within:opacity-100 hover:opacity-100'}`}
            >
              <Icon icon={List} size="sm" className="mx-1 shrink-0 text-travel-bloom dark:text-travel-bloom" />
              {chapterStarts.map(({ dayIndex, title, spreadIndex: idx }) => (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => goToSpread(idx)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs text-travel-ink/80 transition-colors hover:bg-travel-sakura/80 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text"
                >
                  DAY {String(dayIndex).padStart(2, '0')} · {title}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-travel-dim/40 px-3 py-2.5 sm:justify-center sm:px-4 dark:border-shell-line">
        <button type="button" onClick={() => artFlipRef.current?.flipPrev()} className={navBtn}>
          <Icon icon={ChevronLeft} size="sm" />上一页
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center sm:flex-none sm:px-5">
          <span
            aria-live="polite"
            aria-label={`第 ${spreadIndex + 1} 页，共 ${total} 页`}
            className="shrink-0 font-display text-xs tabular-nums text-travel-ink/60 dark:text-shell-muted"
          >
            {currentLabel}
          </span>
        </div>
        <button type="button" onClick={() => artFlipRef.current?.flipNext()} className={navBtn}>
          下一页<Icon icon={ChevronRight} size="sm" />
        </button>
      </footer>
    </div>
  )
}
