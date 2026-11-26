'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, List, Palette, RotateCw, X } from 'lucide-react'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { Icon } from '@/components/mobile/Icon'
import { useCloseOnBack } from '@/hooks/use-close-on-back'
import type { Book } from './TravelBook'
import ArtFlipBook, { type ArtFlipBookHandle } from '../reader/ArtFlipBook'
import { BookPageBody } from '../book/BookPageBody'
import { useBookTheme, useBookTier, themeStyle } from '../book/themes/runtime'
import { BOOK_THEME_METAS } from '../book/themes/types'
import { preloadAdjacentSpreads } from '@/lib/modules/album/book/preload'
import { hapticLight } from '@/lib/mobile/haptics'
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
  /**
   * 横屏阅读（2026-11-16）。
   *
   * 画册是「对开」的一本书：竖屏只显示单页，横屏时左右两页同时摊开（见 paginate dual）。
   * 原生壳在 AndroidManifest 里锁了 portrait，所以这里用官方 ScreenOrientation 插件
   * **按需**把阅读器切到 landscape（用户点按钮才切），退出时恢复 portrait，
   * 不影响其他页面。浏览器里退化为标准 screen.orientation API。
   */
  const [isLandscape, setIsLandscape] = useState(false)
  const landscapeRef = useRef(false)
  landscapeRef.current = isLandscape

  const lockOrientation = useCallback(async (next: 'landscape' | 'portrait') => {
    if (isNativePlatform()) {
      await ScreenOrientation.lock({ orientation: next })
    } else {
      const so = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void } }).orientation
      if (next === 'landscape') {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.()
        await so?.lock?.('landscape')
      } else {
        so?.unlock?.()
        if (document.fullscreenElement) await document.exitFullscreen?.()
      }
    }
    setIsLandscape(next === 'landscape')
  }, [])

  const toggleOrientation = useCallback(() => {
    void lockOrientation(isLandscape ? 'portrait' : 'landscape').catch(() => {
      // 机型/浏览器不支持强制方向时保持当前方向，不打断阅读
    })
  }, [isLandscape, lockOrientation])

  // 退出阅读器时把方向还原（否则会带着横屏回到画册墙）
  useEffect(() => {
    return () => {
      if (!landscapeRef.current) return
      void lockOrientation('portrait').catch(() => {})
    }
  }, [lockOrientation])

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
  /** 当前对开序号的无渲染副本（手势/事件回调里读最新值，避免闭包过期） */
  const spreadIndexRef = useRef(0)
  /** 正在进行的横向滑动手势（一次 pointer 序列只认第一条轨迹） */
  const swipeRef = useRef<{ id: number; x: number; y: number; at: number; fromSpread: number; active?: boolean } | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [spreadIndex, setSpreadIndex] = useState(0)
  /** 是否已经翻过页：首次翻开提示只在「从未翻过」之前出现 */
  const [hasTurned, setHasTurned] = useState(false)
  /**
   * page-flip 控制器状态（read / flipping / fold_corner / user_fold）。
   * 折角或翻页时给台面加「抬起 + 阴影加深」的态：书页离开台面才有重量感，
   * 也顺带让用户的拖拽立刻得到视觉回应（原来整段时间台面毫无变化）。
   */
  const [flipState, setFlipState] = useState('read')
  /** 每次翻页落定后的「纸页落定」微动画（is-settling 类，380ms 后自动摘掉） */
  const [settling, setSettling] = useState(false)
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
          {/*
            首次翻开时的「掀角」暗示：画在**封面页**右下角（不是台面上）。
            画在台面上会随台面高度漂在书页之外（台面比书高一截），贴页才像真书的折角。
            hasTurned 之后不再渲染，不会跟着后续页跑。
          */}
          {/* 双页模式的第一屏是「左页+右页」，掀角要在**右页**的外侧下角；
              单页模式就只有 index 0 这一页。 */}
          {index === (isWide ? 1 : 0) && !hasTurned && (
            <span aria-hidden="true" className="art-flip-corner-hint" />
          )}
        </div>
      )
    }),
    [leaves, isWide, themeKey, hasTurned],
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
    if (reportedSpread !== spreadIndexRef.current) {
      spreadIndexRef.current = reportedSpread
      // 纸页落定：一次很短的「下落回弹」，让翻页收尾不是硬停
      setSettling(true)
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(() => setSettling(false), 380)
      void hapticLight()
    }
    setSpreadIndex(reportedSpread)
  }, [])

  // 卸载时清掉落定定时器（阅读器随时可能被返回键关掉）
  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
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

  /**
   * 「随手左右滑」翻页（2026-11-25 翻页手感优化）。
   *
   * 为什么库自己的 swipe 不够：page-flip 的手势模型是**从书页角折起来**——
   * 手指落在页面中部横划时，它当成"没有角可折"而不动作。真机上大部分人的直觉
   * 是像刷短视频一样在页面中间划一下，于是出现"划了但书不动"。
   *
   * 这里的策略（完全避开与库的拖拽打架）：
   *   · 只接管**页面中部**、横向位移 ≥ 48px、30° 以内、700ms 内完成的轻扫；
   *   · 手势起点在书页左右边缘 40px 内视为"折角"，交给库自己处理；
   *   · 手势过程中页码已经变化（库自己翻了/回弹了）就不再二次翻页；
   *   · 纵向滑动（滚动/切页外的滚动条）一律不接管。
   */
  const onStagePointerDown = useCallback((e: React.PointerEvent) => {
    // 只在触屏/手写笔上接管「随手划」：桌面上鼠标拖动常用于选字/拖图，
    // 桌面另有「点右半页 / 方向键 / 底部按钮」三种翻页方式，不需要这条手势。
    if (e.pointerType === 'mouse') return
    if (e.button !== 0) return
    swipeRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      at: performance.now(),
      fromSpread: spreadIndexRef.current,
    }
  }, [])

  /**
   * 拖动过程中的即时反馈：手指横向移动时让整本书跟手平移（最多 16px）。
   * 没有这一步，中部横划在松手前画面毫无变化，用户会以为"没反应"。
   * 直接用 CSS 变量写样式，不 setState —— 每帧一次 React 渲染在低端机上会掉帧。
   */
  const onStagePointerMove = useCallback((e: React.PointerEvent) => {
    const g = swipeRef.current
    if (!g || g.id !== e.pointerId) return
    if (e.pointerType === 'mouse') return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.25) return
    g.active = true
    const rig = rigRef.current
    if (!rig) return
    rig.classList.add('is-swiping')
    rig.style.setProperty('--swipe-x', (Math.max(-16, Math.min(16, dx * 0.07))).toFixed(2) + 'px')
  }, [])

  /** 结束一次手势：清掉跟手位移（transition 会把书页弹回原位） */
  const resetSwipe = useCallback(() => {
    const rig = rigRef.current
    if (rig) {
      rig.classList.remove('is-swiping')
      rig.style.removeProperty('--swipe-x')
    }
  }, [])

  const onStagePointerUp = useCallback((e: React.PointerEvent) => {
    const g = swipeRef.current
    if (!g || g.id !== e.pointerId) return
    swipeRef.current = null
    resetSwipe()
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    const dt = performance.now() - g.at
    if (dt > 700) return
    if (spreadIndexRef.current !== g.fromSpread) return
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return
    const box = rigRef.current?.querySelector('.art-flipbook-container')?.getBoundingClientRect()
    if (box) {
      // 折角区：库用「边缘拖拽」的语义，交给它（不然一次拖拽会既折角又滑页）
      if (g.x > box.right - 40 || g.x < box.left + 40) return
    }
    if (dx < 0) artFlipRef.current?.flipNext()
    else artFlipRef.current?.flipPrev()
    void hapticLight()
  }, [resetSwipe])

  const onStagePointerCancel = useCallback(() => {
    swipeRef.current = null
    resetSwipe()
  }, [resetSwipe])

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
      <header className="flex items-center justify-between gap-2 border-b border-travel-dim/40 px-3 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] landscape:pb-1 landscape:pt-[max(4px,env(safe-area-inset-top))] sm:px-4 dark:border-shell-line">
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
          {/* 横屏：对开两页（竖屏只显示单页） */}
          <button
            type="button"
            onClick={toggleOrientation}
            aria-pressed={isLandscape}
            aria-label={isLandscape ? '切换竖屏阅读' : '横屏对开阅读'}
            title={isLandscape ? '切回竖屏' : '横屏看对开两页'}
            className="inline-flex items-center gap-1.5 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura dark:bg-white/10 dark:text-shell-text dark:hover:bg-white/20"
          >
            <Icon icon={RotateCw} size="sm" />
            <span className="hidden sm:inline">{isLandscape ? '竖屏' : '横屏'}</span>
          </button>
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
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-2 landscape:py-1 sm:px-4 sm:py-3"
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
      >
        <div
          ref={rigRef}
          data-rig-version={rigVersion}
          className={`art-flip-rig${isWide ? '' : ' art-flip-rig--single'}${settling ? ' is-settling' : ''}`}
          data-flip-state={flipState}
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
            onFlipStateChange={setFlipState}
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

      <footer className="flex items-center justify-between gap-3 border-t border-travel-dim/40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 landscape:pb-1 landscape:pt-1 sm:justify-center sm:px-4 dark:border-shell-line">
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
        </div>
        <button type="button" onClick={() => artFlipRef.current?.flipNext()} className={navBtn}>
          下一页<Icon icon={ChevronRight} size="sm" />
        </button>
      </footer>
    </div>
  )
}
