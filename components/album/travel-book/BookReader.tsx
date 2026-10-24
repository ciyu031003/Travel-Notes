'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, List, Palette, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { useCloseOnBack } from '@/hooks/use-close-on-back'
import type { Book } from './TravelBook'
import ArtFlipBook, { type ArtFlipBookHandle } from '../reader/ArtFlipBook'
import { BookPageBody } from '../book/BookPageBody'
import { useBookTheme, useBookTier, themeStyle } from '../book/themes/runtime'
import { BOOK_THEME_METAS } from '../book/themes/types'
import { preloadAdjacentSpreads } from '@/lib/modules/album/book/preload'
import { composeFromSourceBook } from '@/lib/modules/album/book/mapper'
import { expandPages, paginate } from '@/lib/modules/album/book/paginate'

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
 * 【一屏一个对开】交付给 page-flip 的是**单叶**（一张物理页 = 一个页元素），
 * 由库自己在 landscape 下两两成对 ⇒ 一屏恰好一个对开（左页 + 右页）。
 * 曾经交付的是「一张 sheet = 一个对开（内部再分左右半）」的复合页，而库在
 * landscape 下会把这种页再并排两片 —— 一屏于是出现 **2 个对开（4 个逻辑页）**，
 * 且每片叶只有半页宽（0.4 画幅），照片被压得很小。`paginate()` 仍然保留，
 * 作为对开分组/页码/章节直达的**唯一契约**（它与库的分组逐项一致，见 art 单测）。
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

  // 硬件返回键：主题弹窗开着先关弹窗，否则退出阅读模式（ESC 的既有语义保持不动，
  // 键盘处理仍走下方手写 keydown，避免与弹层基座的 ESC 监听双触发）
  useCloseOnBack(true, showThemes ? () => setShowThemes(false) : onBack)

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
  /** 是否已经翻过页：首次翻开提示只在「从未翻过」之前出现 */
  const [hasTurned, setHasTurned] = useState(false)
  /** page-flip 实例创建次数：性能契约的可观测断言点（应为 1；仅布局模式切换时 +1） */
  const mountCountRef = useRef(0)
  /**
   * 跳转请求的期望对开序号。
   * page-flip 的 flip 事件可能比跳转请求晚到（且落在过渡位置），
   * 因此跳转后一小段时间内以「请求值」为准，超时后才交还给库上报值。
   */
  const pendingSpreadRef = useRef<{ index: number; at: number } | null>(null)

  /**
   * 交付给 page-flip 的**叶**序列（一张物理页 = 一个页元素）。
   *  - dual：跨页出血的逻辑页展开成左半 + 右半（`expandPages`），与 `paginate('dual')`
   *    的物理页序列逐项相同 —— 因此库的两两配对结果 == `spreads`，一屏一个对开；
   *  - single：逻辑页即物理页（整幅照片在单页里 contain 完整展示，不腰斩）。
   */
  const leaves = useMemo(
    () => (isWide ? expandPages(composed.pages) : composed.pages),
    [composed.pages, isWide],
  )

  // 每片叶渲染成独立一页：左页 / 右页由库并排成对开。
  // 叶的位置（书脊阴影画在相对的内侧边）用**下标奇偶**判断，而不是取 `paginate` 的
  // left/right：库在 landscape 下从 0 起两两成对（showCover=false），**落单的末页画在左半**，
  // 而 `paginate` 的落单页约定是「右页起排」。两者分组一致，只有这一片落单页的左右归属不同，
  // 所以位置按库的口径算。单页模式不加位置类（书页铺满，不画书脊阴影）。
  // 依赖里含 themeKey：换主题只重渲染页内容，**不**触发 ArtFlipBook 重建（mountKey 未变）
  const leafNodes = useMemo(
    () => leaves.map((page, index) => {
      const side = isWide ? (index % 2 === 0 ? 'left' : 'right') : undefined
      return (
        <div key={page.id} className={`art-flip-leaf${side ? ` art-flip-leaf--${side}` : ''}`}>
          <BookPageBody page={page} themeKey={themeKey} />
        </div>
      )
    }),
    [leaves, isWide, themeKey],
  )

  const handleRuntimeMount = useCallback(() => {
    mountCountRef.current += 1
    // 实例建好后按**已量到的台面高度**再测量一次：首次挂载时 page-flip 可能在
    // --book-stage-h 落地前就按兜底值定过尺寸（桌面端书页宽高会差一截）。
    requestAnimationFrame(() => artFlipRef.current?.refresh())
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

  // 翻过任何一页后，首次翻开提示永久收起（本次阅读会话内）
  useEffect(() => {
    if (spreadIndex > 0) setHasTurned(true)
  }, [spreadIndex])

  // 挂载：把阅读器顶到内容起点，避免从墙上点击后继续停在旧位置造成视觉错位
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  // 翻页台面尺寸：iOS 工具栏收起/展开、横竖屏切换、刘海屏安全区都会改变可用高度。
  //
  // 为什么必须**真实量**：page-flip 用 autoSize 按**宽度**自适应，而书页高度由宽度
  // 推出（双页 1.6 / 单页 0.8 画幅）。所以「台面高度」决定书页宽度上限，靠
  // `calc(100dvh - 108px)` 这类魔术数字估算顶/底栏高度，一遇安全区或顶栏改版就会
  // 让书页被裁掉脚下。这里量的是 <main>（顶/底栏与安全区都已被 flex 布局扣掉）。
  const stageRef = useRef<HTMLElement | null>(null)
  const rigRef = useRef<HTMLDivElement | null>(null)
  const [stageH, setStageH] = useState(0)
  /** 容器尺寸变化信号（同时进 data 属性，便于实测/诊断） */
  const [rigVersion, setRigVersion] = useState(0)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let last = 0
    const sync = () => {
      // 取**内容盒**高度：main 的 padding 是留给书页的呼吸位，
      // 用 padding 盒会把书页顶到顶栏/底栏的边线上（书页高度正好等于台面高度）。
      const cs = getComputedStyle(el)
      const h = Math.max(
        0,
        Math.round(el.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0')),
      )
      // 忽略亚像素抖动，避免 page-flip 反复重排
      if (Math.abs(h - last) < 2) return
      last = h
      setStageH(h)
      setRigVersion((v) => v + 1)
    }
    sync()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', sync)
      return () => window.removeEventListener('resize', sync)
    }
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 台面高度写进 CSS 变量（`.art-flip-rig` 用它反推书页宽度上限），并催库重新测量。
  // 用 setProperty 而不是 style 属性：自定义属性不在 React 的 CSSProperties 类型里。
  useEffect(() => {
    if (stageH <= 0) return
    rigRef.current?.style.setProperty('--book-stage-h', `${stageH}px`)
    artFlipRef.current?.refresh()
  }, [stageH])

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
  // 首次翻开提示：与 page-flip 的实际命中区域一致 —— 双页模式点右半页向前
  // （左半页向后），单页模式左右滑动 / 点页面右侧向前。
  const showFlipHint = isCover && !hasTurned
  const flipHint = isWide ? '点击右半页或按 → 翻页' : '左右滑动翻页'
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
      <header className="flex items-center justify-between gap-2 border-b border-travel-dim/40 px-3 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] sm:px-4 dark:border-shell-line">
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
                      <span className="text-[11px] leading-snug text-travel-ink/80 dark:text-shell-muted">{meta.description}</span>
                    </button>
                  )
                })}
                <p className="px-3 pb-1 pt-2 text-[11px] leading-snug text-travel-ink/80 dark:text-shell-faint">
                  主题只改变版式外观，不影响画册页数与顺序。
                </p>
              </div>
            </>
          )}
        </div>
      </header>

      <main
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-2 sm:px-4 sm:py-3"
      >
        <div
          ref={rigRef}
          data-rig-version={rigVersion}
          className={`art-flip-rig${isWide ? '' : ' art-flip-rig--single'}`}
        >
          {/* mountKey 由 (bookKey, 布局模式) 组成：只有真正换了页面集合才重建整本书。
              主题与视觉档都不在 mountKey 里 —— 换主题不重建。
              pages 必须是**叶**序列（一页一个元素）：见文件头「一屏一个对开」。
              这里**不传**「当前页」prop：游标由库自己拥有，跳转一律走 goToSpread →
              turnToSpread（命令式），页码由 onPageChange 回报驱动。
              声明式同步会在双页展开下把对开序号当叶索引用，与跳转抢步（见 ArtFlipBook 文件头）。 */}
          <ArtFlipBook
            key={`${book.bookKey || book.travelId}:${isWide ? 'dual' : 'single'}`}
            mountKey={`${book.bookKey || book.travelId}:${isWide ? 'dual' : 'single'}`}
            ref={artFlipRef}
            pages={leafNodes}
            onPageChange={handlePageChange}
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

      <footer className="flex items-center justify-between gap-3 border-t border-travel-dim/40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 sm:justify-center sm:px-4 dark:border-shell-line">
        <button type="button" onClick={() => artFlipRef.current?.flipPrev()} className={navBtn}>
          <Icon icon={ChevronLeft} size="sm" />上一页
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center sm:flex-none sm:px-5">
          <span
            aria-live="polite"
            aria-label={`第 ${spreadIndex + 1} 页，共 ${total} 页`}
            className="shrink-0 font-display text-xs tabular-nums text-travel-ink/80 dark:text-shell-muted"
          >
            {currentLabel}
          </span>
          {/*
            首次翻开提示：行高常驻固定高度，只在封面且从未翻页时填字。
            这样提示出现/消失不会改变底栏高度 —— 否则台面高度会变，
            书页要跟着重新丈量（视觉上抖一下）。
          */}
          <span
            aria-hidden="true"
            className="h-3 shrink-0 text-[11px] leading-3 text-travel-ink/45 dark:text-shell-faint"
          >
            {showFlipHint ? flipHint : ''}
          </span>
        </div>
        <button type="button" onClick={() => artFlipRef.current?.flipNext()} className={navBtn}>
          下一页<Icon icon={ChevronRight} size="sm" />
        </button>
      </footer>
    </div>
  )
}
