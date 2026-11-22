'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { X, MapPin, Sparkles, ChevronUp, ChevronDown, ChevronLeft } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { IconBadge } from '@/components/mobile/IconBadge'
import { markOverlayNavigation } from '@/hooks/use-close-on-back'
import { useModalLayer } from '@/hooks/use-modal-layer'
import { getProvince } from '@/data/provinces'
import { getCitiesByProvince, type City } from '@/data/cities'
import { travelDetailHref } from '@/lib/routes'
import type { PostMeta } from './types'

/** 全屏吸附位顶部留白（与旧实现 calc(100dvh - 56px) 一致：上方仍能看到地图一角） */
const TOP_GAP = 56
/** 半屏吸附位高度占视口比例（旧实现 62dvh） */
const HALF_RATIO = 0.62
/** 退场动画时长：与 .m-prov-sheet--exit 的 --m-dur-page(240ms) 对齐，留 40ms 余量 */
const EXIT_MS = 280
/** 拖拽判定阈值 */
const DRAG_START_PX = 6
/** 快速下滑关闭的速度阈值（px/ms，真机轻甩大约 0.8~2.0） */
const FLING_CLOSE = 0.55

export default function MobileProvinceDrawer({
  postsByProvince,
  citiesWithPosts,
  provinceId,
  city,
  expanded,
  onToggleExpand,
  onClose,
  onCityClick,
  onBack,
}: {
  postsByProvince: Map<string, PostMeta[]>
  citiesWithPosts: Map<string, PostMeta[]>
  provinceId: string | null
  city: City | null
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
  onCityClick: (city: City) => void
  onBack: () => void
}) {
  /**
   * 必须 portal 到 document.body（2026-10-12 修复）。
   *
   * 原因：本组件是 fixed 定位的底部抽屉，而 CSS 规定**任何非 none 的 transform
   * 都会让祖先成为 fixed 的包含块**。地图页的调用链上存在多个带常驻 transform 的
   * 祖先（PullToRefresh 的内容层、`m-enter` 动画的 fill-mode:both 会保留
   * translateY(0) scale(1)）。一旦被这些祖先捕获，抽屉的 `bottom-0` 就变成
   * "相对那一层内容容器的底部" —— 真机表现是弹窗跑到整页最下方，
   * 用户必须一直往下拉才能看到。
   *
   * portal 到 body 后，fixed 重新相对视口，行为与 BottomSheet 一致。
   */
  const [mounted, setMounted] = useState(false)
  /**
   * 退场阶段：**由本组件自己发起**（requestClose）并占用 240ms 播完动画，
   * 动画结束后才回调父级 onClose（父级此时把 provinceId 置空 → 面板卸载）。
   * 为什么不反过来（父级先置空、组件再补播）：父级置空会立刻卸载面板 DOM，
   * 新建的节点从「视口外」开始，退场动画就变成了「消失再出现」，是典型的网页感。
   */
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const panelRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  /** 面板几何：H = 全屏高度（px），halfY = 半屏吸附位的 translateY（px） */
  const metricsRef = useRef({ H: 0, halfY: 0, vh: 0 })
  /** 当前 translateY（拖拽/吸附的实时值，避免每帧 setState） */
  const yRef = useRef(0)
  const enteredRef = useRef(false)
  const reduceRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const exitTimerRef = useRef<number | null>(null)
  const expandedRef = useRef(expanded)
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startY: 0,
    baseY: 0,
    moved: false,
    lastY: 0,
    lastT: 0,
    velocity: 0,
  })
  const suppressClickRef = useRef(false)
  /** 是否已捕获指针（只在真正开始拖动后才捕获，否则 click 会被改派到面板） */
  const capturedRef = useRef(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current)
    },
    [],
  )

  /** 请求关闭：先播退场动画，动画结束才真正通知父级卸载（见 closing 注释） */
  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
  }, [])

  /**
   * 关闭入口统一走 requestClose。
   * 城市二级页时返回键先回省份列表（与原 useCloseOnBack 的层级语义一致）。
   */
  const dismiss = useCallback(() => {
    if (city) onBack()
    else requestClose()
  }, [city, onBack, requestClose])

  useModalLayer({
    open: mounted && !!provinceId && !closing,
    onClose: dismiss,
    panelRef,
  })

  // ── 几何测量（dvh 与实际像素对齐；旋转/地址栏变化时重测）────────────────
  const measure = useCallback(() => {
    const panel = panelRef.current
    const vh = window.visualViewport?.height ?? window.innerHeight
    const H = panel && panel.offsetHeight > 0 ? panel.offsetHeight : Math.max(240, vh - TOP_GAP)
    const halfY = Math.max(0, Math.round(H - HALF_RATIO * vh))
    metricsRef.current = { H, halfY, vh }
    return metricsRef.current
  }, [])

  const setOverlay = useCallback((opacity: number) => {
    const el = overlayRef.current
    if (el) el.style.opacity = String(opacity)
  }, [])

  /** 遮罩不透明度跟随展开进度：全屏/半屏都是满遮罩，往下拖（关闭方向）才淡出 */
  const overlayForY = useCallback((y: number) => {
    const { H, halfY } = metricsRef.current
    const span = Math.max(1, H - halfY)
    return Math.min(1, Math.max(0, (H - y) / span))
  }, [])

  /** 只写 transform（合成属性），不触发 React 渲染 */
  const applyY = useCallback((y: number, mode: 'enter' | 'exit' | 'none') => {
    const panel = panelRef.current
    if (!panel) return
    panel.classList.toggle('m-prov-sheet--enter', mode === 'enter')
    panel.classList.toggle('m-prov-sheet--exit', mode === 'exit')
    panel.classList.toggle('m-prov-sheet--drag', mode === 'none')
    panel.style.transform = `translate3d(0, ${y}px, 0)`
    yRef.current = y
  }, [])

  const shouldRender = mounted && !!provinceId

  // ── 入场：先落到视口下方，下一帧再弹簧吸附到当前吸附位 ──────────────────
  useLayoutEffect(() => {
    if (!shouldRender) return
    const m = measure()
    reduceRef.current =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    enteredRef.current = false
    applyY(m.H, 'none')
    setOverlay(0)
    const raf = requestAnimationFrame(() => {
      rafRef.current = null
      // 入场动画播完前就被关闭（极快连点）：不要再把面板拉回来
      if (closingRef.current) return
      enteredRef.current = true
      const target = expandedRef.current ? 0 : m.halfY
      applyY(target, reduceRef.current ? 'none' : 'enter')
      setOverlay(1)
    })
    rafRef.current = raf
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [shouldRender, measure, applyY, setOverlay])

  // ── 退场：从当前位置滑回视口下方 + 遮罩淡出，播完再卸载 ────────────────
  useLayoutEffect(() => {
    if (!closing) return
    const m = measure()
    applyY(m.H, reduceRef.current ? 'none' : 'exit')
    setOverlay(0)
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current)
    exitTimerRef.current = window.setTimeout(
      () => {
        exitTimerRef.current = null
        enteredRef.current = false
        yRef.current = 0
        closingRef.current = false
        // 先让父级把 provinceId 置空（卸载面板），再清本地 closing —— 同一批渲染
        onCloseRef.current()
        setClosing(false)
        const panel = panelRef.current
        if (panel) {
          panel.style.transform = ''
          panel.classList.remove('m-prov-sheet--enter', 'm-prov-sheet--exit', 'm-prov-sheet--drag')
        }
        if (overlayRef.current) overlayRef.current.style.opacity = ''
      },
      reduceRef.current ? 60 : EXIT_MS,
    )
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
    }
  }, [closing, measure, applyY, setOverlay])

  // 半屏 ↔ 全屏：吸附位切换也用弹簧（height 不再参与动画）
  useLayoutEffect(() => {
    if (!shouldRender || closing || !enteredRef.current) return
    const m = measure()
    applyY(expanded ? 0 : m.halfY, reduceRef.current ? 'none' : 'enter')
    setOverlay(1)
  }, [expanded, shouldRender, closing, measure, applyY, setOverlay])

  // 视口变化（旋转 / 地址栏收起 / 键盘）：不播动画，直接归位
  useEffect(() => {
    if (!shouldRender) return
    const onResize = () => {
      const m = measure()
      if (!enteredRef.current) return
      applyY(expandedRef.current ? 0 : m.halfY, 'none')
      setOverlay(1)
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [shouldRender, measure, applyY, setOverlay])

  // ── 拖拽把手（pointer 事件，带速度判定）──────────────────────────────────
  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (closing || event.button > 0 || !enteredRef.current) return
      const target = event.target as HTMLElement
      // 拖拽热区只有把手 + 标题栏：内容区两种吸附位下都要能滚动，
      // 从内容起手会把滚动抢成拖拽（10 个城市半屏只露 3~4 个，必须能滚）。
      if (!target.closest('[data-sheet-grab]')) return
      dragRef.current = {
        active: true,
        pointerId: event.pointerId,
        startY: event.clientY,
        baseY: yRef.current,
        moved: false,
        lastY: event.clientY,
        lastT: event.timeStamp,
        velocity: 0,
      }
      suppressClickRef.current = false
      const panel = panelRef.current
      panel?.classList.remove('m-prov-sheet--enter', 'm-prov-sheet--exit')
      panel?.classList.add('m-prov-sheet--drag')
      overlayRef.current?.classList.add('m-prov-overlay--drag')
      capturedRef.current = false
    },
    [closing],
  )

  const moveDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag.active || event.pointerId !== drag.pointerId) return
      const dy = event.clientY - drag.startY
      if (!drag.moved && Math.abs(dy) > DRAG_START_PX) drag.moved = true
      if (drag.moved && !capturedRef.current) {
        capturedRef.current = true
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* 老 WebView 不支持指针捕获时退化为普通事件流 */
        }
      }
      const { H, halfY } = metricsRef.current
      let y = drag.baseY + dy
      // 全屏再往上 / 半屏再往下：橡皮筋阻尼，跟手但不失控
      if (y < 0) y = y * 0.2
      const over = halfY + (H - halfY) * 0.9
      if (y > over) y = over + (y - over) * 0.35
      applyY(y, 'none')
      if (!reduceRef.current) setOverlay(overlayForY(y))
      const dt = event.timeStamp - drag.lastT
      if (dt > 0) {
        const instant = (event.clientY - drag.lastY) / dt
        drag.velocity = drag.velocity * 0.6 + instant * 0.4
      }
      drag.lastY = event.clientY
      drag.lastT = event.timeStamp
      if (drag.moved && event.cancelable) event.preventDefault()
    },
    [applyY, setOverlay, overlayForY],
  )

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag.active || event.pointerId !== drag.pointerId) return
      drag.active = false
      capturedRef.current = false
      suppressClickRef.current = drag.moved
      panelRef.current?.classList.remove('m-prov-sheet--drag')
      overlayRef.current?.classList.remove('m-prov-overlay--drag')
      const { H, halfY } = metricsRef.current
      const y = yRef.current
      const v = drag.velocity
      const wasFull = expandedRef.current
      const closeLine = halfY + (H - halfY) * 0.35
      // 快速下滑 / 拖过关闭线：直接关闭（走 requestClose → 从当前位置继续退场）
      if (v > FLING_CLOSE || y > closeLine) {
        requestClose()
        return
      }
      if (wasFull) {
        if (y > halfY * 0.4 || v > 0.25) {
          onToggleExpand()
          return
        }
        applyY(0, 'enter')
      } else {
        if (y < halfY * 0.62 || v < -0.4) {
          onToggleExpand()
          return
        }
        applyY(halfY, 'enter')
      }
      setOverlay(1)
    },
    [requestClose, onToggleExpand, applyY, setOverlay],
  )

  /** 拖拽结束后浏览器仍会合成一次 click：位移过就吞掉，避免误触内容里的链接 */
  const onClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  if (!mounted || !shouldRender || !provinceId) return null
  const provinceInfo = getProvince(provinceId)
  if (!provinceInfo) return null

  const activeCity = city
  const cities = getCitiesByProvince(provinceId)
  const provincePosts = postsByProvince.get(provinceId) || []
  const cityPosts = activeCity ? citiesWithPosts.get(`${activeCity.name}-${provinceId}`) || [] : []

  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden" data-no-swipeback="">
      {/* 遮罩：opacity 由 JS 按展开进度写（拖拽时跟手淡出） */}
      <div
        ref={overlayRef}
        data-map-overlay
        aria-hidden="true"
        onClick={requestClose}
        className="m-prov-overlay absolute inset-0 bg-black/[0.18]"
        style={{ opacity: 0 }}
      />

      <div
        ref={panelRef}
        data-map-overlay
        role="dialog"
        aria-modal="true"
        aria-label={`${provinceInfo.name} 旅行足迹`}
        tabIndex={-1}
        className="m-prov-sheet absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3xl border-t border-[var(--m-line-strong)] bg-[var(--m-surface-solid)] shadow-[var(--m-elev-3)]"
        style={{ height: `calc(100dvh - ${TOP_GAP}px)`, transform: 'translate3d(0, 100%, 0)' }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {/* 首个可聚焦元素（视觉隐藏）：承接 useModalLayer 的初始焦点，避免把手被
            焦点环画出边框；同时给读屏用户一个"打开即可关闭"的入口 */}
        <button
          type="button"
          onClick={requestClose}
          className="sr-only"
          aria-label="关闭省份面板"
        >
          关闭省份面板
        </button>

        {/* 把手：可视化提示 + 点击切换全屏/半屏；整条是拖拽热区 */}
        <div data-sheet-grab="" className="m-prov-sheet__grab flex shrink-0 justify-center pt-2.5 pb-1">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? '收起为半屏' : '展开为全屏'}
            className="m-press group inline-flex items-center gap-2 px-3 py-1.5"
          >
            <span className="h-1.5 w-12 rounded-full bg-[var(--m-faint)] transition group-active:scale-90" />
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
              {expanded ? <Icon icon={ChevronDown} size="sm" /> : <Icon icon={ChevronUp} size="sm" />}
            </span>
          </button>
        </div>

        {/* 标题栏（同属拖拽热区） */}
        <div data-sheet-grab="" className="m-prov-sheet__grab flex items-center justify-between border-b border-[var(--m-line)] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {activeCity ? (
              <>
                <button
                  type="button"
                  onClick={onBack}
                  className="m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]"
                  aria-label="返回省份"
                >
                  <Icon icon={ChevronLeft} size="md" />
                </button>
                <div className="min-w-0">
                  <h3 className="truncate text-[18px] font-bold text-[var(--m-text)]">{activeCity.name}</h3>
                  <p className="truncate text-xs text-[var(--m-muted)]">{activeCity.nameEn} · {cityPosts.length} 条记录</p>
                </div>
              </>
            ) : (
              <>
                <IconBadge icon={MapPin} tone="sun" size="md" />
                <div className="min-w-0">
                  <h3 className="truncate text-[18px] font-bold text-[var(--m-text)]">{provinceInfo.name}</h3>
                  <p className="truncate text-xs text-[var(--m-muted)]">{provinceInfo.nameEn} · {cities.length} 个城市</p>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--m-surface-2)] text-[var(--m-muted)]"
            aria-label="关闭"
          >
            <Icon icon={X} size="md" />
          </button>
        </div>

        {/*
          内容：半屏/全屏都可滚动（半屏也能看到全部城市）；纵向拖拽只从把手/标题栏起手。
          注意：面板是恒定全高的，半屏时内容区有 (38dvh - 56px) 落在视口下方 —— 此时 body 的
          scrollHeight 仍按整块算，等于「滚不动，最后一屏永远看不到」。所以收起态在末尾
          垫一个等高的 spacer，把可滚动范围补齐到可见区域。
        */}
        <div className="m-prov-sheet__body m-prov-sheet__body--scroll min-h-0 flex-1 px-5 pb-[max(18px,env(safe-area-inset-bottom))]">
          {activeCity ? (
            <CityPosts cityName={activeCity.name} posts={cityPosts} />
          ) : (
            <>
              {provincePosts.length > 0 && (
                <section className="pt-4">
                  <div className="mb-3 flex items-center gap-2 text-xs text-[var(--m-muted)]">
                    <Icon icon={Sparkles} size="sm" tone="accent" />
                    <span>该省旅行记录</span>
                    <span className="ml-auto rounded-full bg-[var(--m-accent-soft)] px-2.5 py-0.5 font-semibold text-[var(--m-accent-strong)]">
                      {provincePosts.length}
                    </span>
                  </div>
                  <PostList posts={provincePosts} />
                </section>
              )}

              <section className="pt-4">
                <div className="mb-3 flex items-center gap-2 text-xs text-[var(--m-muted)]">
                  <Icon icon={MapPin} size="sm" tone="accent" />
                  <span>城市足迹</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {cities.map((c) => {
                    const key = `${c.name}-${provinceId}`
                    const count = citiesWithPosts.get(key)?.length || 0
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onCityClick(c)}
                        className={`flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition ${
                          count > 0
                            ? 'border-[var(--m-accent-soft)] bg-[var(--m-accent-soft)]/40'
                            : 'border-[var(--m-line)] bg-[var(--m-surface)]'
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          count > 0 ? 'bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]' : 'bg-[var(--m-surface-2)] text-[var(--m-faint)]'
                        }`}>
                          <Icon icon={MapPin} size="sm" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[var(--m-text)]">{c.name}</span>
                          <span className="block text-xs text-[var(--m-muted)]">{count > 0 ? `${count} 条记录` : '尚未抵达'}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            </>
          )}
          {!expanded && <div aria-hidden="true" className="m-prov-sheet__spacer" />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PostList({ posts }: { posts: PostMeta[] }) {
  if (posts.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--m-muted)]">还没有旅行记录</p>
  }
  return (
    <div className="space-y-2.5">
      {posts.map((post) => {
        const cover = post.cover || post.images?.[0]
        return (
          <Link
            key={post.slug}
            href={travelDetailHref(post.slug)}
            // 抽屉打开时压了一条同 URL 历史；不标记的话，导航开始时 useCloseOnBack 的
            // cleanup 会 history.back() 把这次跳转顶回去 —— 真机表现「点卡片没反应」。
            onClick={markOverlayNavigation}
            className="flex items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface)] p-2.5 transition active:scale-[0.99]"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--m-surface-2)]">
              {cover ? (
                <Image src={cover} alt={post.title} fill sizes="56px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Icon icon={MapPin} size="md" tone="faint" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-[var(--m-text)]">{post.title}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--m-muted)]">{post.location || post.date}</p>
            </div>
            <Icon icon={ChevronUp} size="sm" tone="faint" className="shrink-0 rotate-90" />
          </Link>
        )
      })}
    </div>
  )
}

function CityPosts({ cityName, posts }: { cityName: string; posts: PostMeta[] }) {
  return (
    <section className="pt-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--m-muted)]">
        <Icon icon={MapPin} size="sm" tone="accent" />
        <span>{cityName} 的旅行记录</span>
      </div>
      <PostList posts={posts} />
    </section>
  )
}