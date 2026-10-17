'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  DEFAULT_FLIPPING_TIME_MS,
  resolveFlippingTime,
  resolveShadowOpacity,
} from '@/lib/modules/album/book/flip-runtime'

/* ==========================================================================
   ArtFlipBook — 基于 St.PageFlip 的 React 封装
   提供 3D 翻页效果，适用于摄影画册（Art Mode）
   runtime: public/vendor/page-flip.browser.js（MIT / Copyright (c) 2020 Nodlik，2.0.7 等价产物）

   【性能契约 · Album 2.0 P0】
   本组件**只在真实 DOM 容器出现时**把页面集合交给 page-flip 一次（loadFromHTML）。
   严禁在页面内容变化时调用 pageFlip.updateFromHtml()：该 API 内部是
   `pages.destroy() → new PageCollection → load() → render.reload()`，
   即「销毁整本书 → 重建全部页元素 → 重建 canvas → 重新测量」。
   一本 128 图的画册若在翻页过程中触发 N 次，就是 N 次整本重建——这是相册翻页卡顿的根因。

   因此本组件：
     1. 不订阅 `pages`（页面集合一次性稳定，由调用方保证）；
     2. 需要换页面集合时，改 `mountKey`，由 React 连容器 DOM 一起重建（显式、可计数）；
     3. 用 callback ref 而非 useEffect 建实例——这样 React StrictMode 的
        「挂载→卸载→再挂载」模拟不会重复创建，也不会留下被 destroy 过的脏容器。

   【容器 key 不变式】容器元素的 `key` 必须覆盖「建实例 effect」的**全部**输入
   （mountKey / portrait / retryNonce）。原因在第 2 条：库的 `destroy()` 会连带
   移除整棵页元素 DOM，而 React 以为页元素还在原容器里。只要 effect 在一次
   「容器没换」的情况下重跑，新实例就会 `loadFromHTML` 到 0 个页元素 ——
   画册直接变空白。所以「会重建」的输入必须同时进 key。

   【视觉档只在运行时同步】翻页时长 / 阴影属于视觉档，不是页面集合，
   改它们走 `getSettings()` 活对象（见下方 sync effect），不进 key。
   ========================================================================== */

/** 把「当前翻动单位」上报出去：landscape 双页展开下 spread 数才是总页数 */
export interface ArtFlipBookHandle {
  flipNext: () => void
  flipPrev: () => void
  /** 跳到指定**页**（page-flip 内部页索引） */
  turnToPage: (page: number) => void
  /** 跳转到指定**对开**（跨页序号，与 PageIndicator 同口径）——章节跳转 / Home / End 用它 */
  turnToSpread: (spreadIndex: number) => void
  /** 当前对开序号（由库的对开表给出，绝对定位的判据） */
  getCurrentSpread: () => number
  getCurrentPage: () => number
  getPageCount: () => number
  /**
   * 让库按**当前容器尺寸**重新测量（含横竖朝向重判）。
   * 容器的宽高由外部「台面高度」推导，尺寸变化不一定伴随 window resize
   * （首次量到台面高度、iOS 工具栏收放、安全区变化），此时必须显式催一次。
   */
  refresh: () => void
}

interface ArtFlipBookProps {
  /** 页面内容数组（React 节点）。必须一次性稳定：见上方性能契约 */
  pages: React.ReactNode[]
  /** 翻页动画时长（ms） */
  flippingTime?: number
  /** 单页（竖排）模式：窄屏 true 一页一页翻；宽屏 false 双页展开（横屏照片真跨页） */
  portrait?: boolean
  /** 页面切换回调 */
  onPageChange?: (pageIndex: number, spreadIndex?: number, spreadTotal?: number) => void
  /** 外部控制当前页 */
  currentPage?: number
  /** 是否绘制翻页阴影（lite 档关掉以省 GPU） */
  drawShadow?: boolean
  /**
   * 挂载身份：值变化时整组件连 DOM 一起重建（销毁旧 page-flip 实例）。
   * 用于「必须换页面集合」的场景（如桌面/移动布局切换导致跨页序列变化）。
   */
  mountKey?: string | number
  /** page-flip 实例创建完成时回调，供调用方计数/诊断 */
  onRuntimeMount?: () => void
}

/** vendored page-flip 暴露在 window.St 上，这里给出用到的那部分形状，替代 any */
interface PageFlipCollection {
  /** 对开分组：数组下标 = 对开序号，值为该对开包含的页索引 */
  getSpread?: () => number[][]
  getCurrentSpreadIndex?: () => number
  getSpreadIndexByPage?: (page: number) => number | null
}
interface PageFlipUI {
  /** 重排入口：内部走 `render.update()`，会重算 bounds/朝向并按需上报 */
  update?: () => void
}
interface PageFlipInstance {
  loadFromHTML: (els: NodeListOf<HTMLElement>) => void
  on: (event: string, cb: () => void) => void
  destroy: () => void
  /** 无动画定位到某页；对不在对开表里的索引会**静默放弃**，不要用于跨对开跳转 */
  turnToPage: (page: number) => void
  flipNext: (corner?: string) => void
  flipPrev: (corner?: string) => void
  getCurrentPageIndex: () => number
  getPageCount: () => number
  getPageCollection?: () => PageFlipCollection
  /**
   * 运行时设置对象。库里的 `getSettings()` 返回的是**活对象**（`Object.assign`
   * 到内部 default 上），改写字段即对后续动画生效。
   */
  getSettings?: () => PageFlipSettings
  /** UI 层：暴露重新测量的入口 */
  getUI?: () => PageFlipUI
}
type PageFlipCtor = new (el: HTMLElement, settings: Record<string, unknown>) => PageFlipInstance

/** 本组件会运行时改写的设置字段（只列用到的那部分） */
interface PageFlipSettings {
  flippingTime: number
  drawShadow: boolean
  maxShadowOpacity: number
}

const SCRIPT_FLAG = 'artFlipbook'

function getPageFlipCtor(): PageFlipCtor | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as { St?: { PageFlip?: PageFlipCtor } }).St?.PageFlip
}

/** 确保 vendored page-flip 已执行（幂等：以 script[data-art-flipbook] 去重） */
function ensureRuntime(): Promise<PageFlipCtor> {
  const existingCtor = getPageFlipCtor()
  if (existingCtor) return Promise.resolve(existingCtor)

  return new Promise((resolve, reject) => {
    const attach = (script: HTMLScriptElement) => {
      script.addEventListener('load', () => {
        const ctor = getPageFlipCtor()
        ctor ? resolve(ctor) : reject(new Error('page-flip 已加载但未暴露 St.PageFlip'))
      })
      script.addEventListener('error', () => reject(new Error('page-flip.browser.js 加载失败')))
    }
    const pending = document.querySelector<HTMLScriptElement>(`script[data-${SCRIPT_FLAG}]`)
    if (pending) {
      attach(pending)
      return
    }
    const script = document.createElement('script')
    script.src = '/vendor/page-flip.browser.js'
    script.async = false
    script.dataset[SCRIPT_FLAG] = '1'
    attach(script)
    document.head.appendChild(script)
  })
}

/**
 * ArtFlipBook — 3D 翻页画册组件
 *
 * 封装 St.PageFlip 库，提供：
 * - 真实 3D 翻页动画（模拟纸页弯曲/阴影）
 * - 触摸 / 鼠标翻页（键盘由调用方绑定）
 * - 跨页模式（桌面双页，移动单页）
 * - 边缘点击、滑动翻页
 */
const ArtFlipBook = forwardRef<ArtFlipBookHandle, ArtFlipBookProps>(function ArtFlipBook(
  { pages, flippingTime = DEFAULT_FLIPPING_TIME_MS, portrait = true, drawShadow = true, onPageChange, currentPage, mountKey = 0, onRuntimeMount },
  ref,
) {
  const pageFlipRef = useRef<PageFlipInstance | null>(null)
  const [pendingEl, setPendingEl] = useState<HTMLDivElement | null>(null)
  const [runtimeError, setRuntimeError] = useState(false)
  /** 重试计数：变化即重建容器（React 会连 DOM 一起换掉） */
  const [retryNonce, setRetryNonce] = useState(0)
  const onPageChangeRef = useRef(onPageChange)
  const onRuntimeMountRef = useRef(onRuntimeMount)
  const syncingRef = useRef(false)
  const disposedRef = useRef(false)
  /** 相对步进用到的定时器（卸载时清理，避免对已销毁的实例继续操作） */
  const stepTimersRef = useRef<number[]>([])

  onPageChangeRef.current = onPageChange
  onRuntimeMountRef.current = onRuntimeMount

  /**
   * 建实例时用到的运行时参数（已换算成库可接受值）。
   *
   * 走 ref 而不是 effect 依赖：视觉档变化必须**只改活实例的设置**，
   * 不能让建实例的 effect 重跑 —— 重跑会在同一个容器上销毁旧实例
   * （`destroy()` 会移除整棵页元素 DOM），新实例随即 `loadFromHTML` 到 0 页。
   * `resolveFlippingTime` 同时保证 `flippingTime` 恒 > 0：库对
   * `flippingTime <= 0` 直接抛 "Invalid flipping time"（reduced 档语义值就是 0）。
   */
  const runtimeSettingsRef = useRef({ flippingTime: resolveFlippingTime(flippingTime), drawShadow })
  runtimeSettingsRef.current = { flippingTime: resolveFlippingTime(flippingTime), drawShadow }

  // callback ref：只在真实 DOM 挂载/卸载时触发，StrictMode 的模拟卸载不会让容器变脏
  const setContainer = useCallback((el: HTMLDivElement | null) => {
    setPendingEl(el)
  }, [])

  useEffect(() => {
    if (!pendingEl) return
    let cancelled = false
    let instance: PageFlipInstance | null = null

    ensureRuntime()
      .then((PageFlip) => {
        if (cancelled || disposedRef.current) return

        const runtime = runtimeSettingsRef.current
        instance = new PageFlip(pendingEl, {
          width: 512,
          height: 640,
          size: 'stretch',
          minWidth: Math.max(1, Math.round(512 * 0.56)),
          maxWidth: Math.max(1, Math.round(512 * 1.04)),
          minHeight: Math.max(1, Math.round(640 * 0.56)),
          maxHeight: Math.max(1, Math.round(640 * 1.04)),
          drawShadow: runtime.drawShadow,
          flippingTime: runtime.flippingTime,
          usePortrait: portrait,
          startZIndex: 10,
          autoSize: true,
          maxShadowOpacity: resolveShadowOpacity(runtime.drawShadow),
          showCover: true,
          mobileScrollSupport: false,
          clickEventForward: true,
          useMouseEvents: true,
          swipeDistance: 24,
          showPageCorners: true,
          disableFlipByClick: false,
        })

        // 页面集合在此一次性交付；之后不再调用 updateFromHtml（见文件头性能契约）
        instance.loadFromHTML(pendingEl.querySelectorAll<HTMLElement>('.art-flip-page'))

        const reportCurrent = (pf: PageFlipInstance) => {
          const col = pf.getPageCollection?.()
          let spreadIndex: number | undefined
          let spreadTotal: number | undefined
          if (col) {
            const spreads = col.getSpread?.()
            if (Array.isArray(spreads)) {
              spreadIndex = col.getCurrentSpreadIndex?.()
              spreadTotal = spreads.length
            }
          }
          onPageChangeRef.current?.(pf.getCurrentPageIndex(), spreadIndex, spreadTotal)
        }

        instance.on('init', () => reportCurrent(instance as PageFlipInstance))
        instance.on('update', () => reportCurrent(instance as PageFlipInstance))
        // 横竖屏切换会重建对开分组，必须重新上报，否则页码会停在校准前的旧值
        instance.on('changeOrientation', () => reportCurrent(instance as PageFlipInstance))
        instance.on('flip', () => {
          if (syncingRef.current) return
          reportCurrent(instance as PageFlipInstance)
        })

        pageFlipRef.current = instance
        onRuntimeMountRef.current?.()
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[ArtFlipBook]', err)
        setRuntimeError(true)
      })

    return () => {
      cancelled = true
      try {
        instance?.destroy()
      } catch {
        // 容器可能已被 React 移除
      }
      if (pageFlipRef.current === instance) pageFlipRef.current = null
    }
    // 依赖只留「容器身份」：见文件头的容器 key 不变式。
    // flippingTime / drawShadow 走 runtimeSettingsRef + 下面的 sync effect。
  }, [pendingEl, portrait, mountKey])

  /**
   * 视觉档运行时同步（翻页时长 / 阴影）。
   *
   * 为什么不能靠重建实例：`destroy()` 会把整棵页元素 DOM 一起移除，而 React 认为
   * 这些页元素还挂在容器里，于是重建后的新实例 `loadFromHTML` 拿到空 NodeList。
   * 结果是「低端机 detectTier 落在 lite」或「系统开启 reduced-motion」的用户
   * 打开画册时整本书消失。库的 settings 是活对象，直接改写即可生效。
   */
  useEffect(() => {
    const settings = pageFlipRef.current?.getSettings?.()
    if (!settings) return
    settings.flippingTime = resolveFlippingTime(flippingTime)
    settings.drawShadow = drawShadow
    settings.maxShadowOpacity = resolveShadowOpacity(drawShadow)
  }, [flippingTime, drawShadow, pendingEl, mountKey])

  // 卸载标记：异步 ensureRuntime 回调里据此丢弃过期结果
  useEffect(() => () => {
    disposedRef.current = true
    for (const t of stepTimersRef.current) window.clearTimeout(t)
    stepTimersRef.current = []
  }, [])

  // 从外部同步当前页
  useEffect(() => {
    const pf = pageFlipRef.current
    if (!pf || currentPage === undefined) return
    if (pf.getCurrentPageIndex() === currentPage) return
    syncingRef.current = true
    pf.turnToPage(currentPage)
    const timer = setTimeout(() => { syncingRef.current = false }, flippingTime + 100)
    return () => clearTimeout(timer)
  }, [currentPage, flippingTime, pendingEl, mountKey])

  useImperativeHandle(ref, () => ({
    flipNext: () => pageFlipRef.current?.flipNext('bottom'),
    flipPrev: () => pageFlipRef.current?.flipPrev('bottom'),
    turnToPage: (p: number) => pageFlipRef.current?.turnToPage(p),
    turnToSpread: (spreadIndex: number) => {
      const pf = pageFlipRef.current
      if (!pf) return
      const col = pf.getPageCollection?.()
      const current = col?.getCurrentSpreadIndex?.() ?? 0
      const steps = spreadIndex - current
      if (steps === 0) return
      // 【为什么用相对步进而不是绝对定位】
      // page-flip 的绝对跳转有两条路，都不可靠：
      //   · turnToPage → pages.show()：目标索引不在对开表里时**静默放弃**；
      //   · flip → flipController.flipToPage()：能跳，但库内部 currentPageIndex /
      //     currentSpreadIndex 会在这之后漂移（实测 End 到末页后按 Home，指示停在 03）。
      // 相对步进只依赖 flipNext/flipPrev 与库自己维护的 spread 游标，是唯一稳定的路径。
      // 步数上限 200：画册对开数量级远小于此，超出说明状态异常，直接放弃避免卡死。
      const dir = steps > 0 ? 'next' : 'prev'
      const total = Math.min(Math.abs(steps), 200)
      let done = 0
      const step = () => {
        if (disposedRef.current || done >= total) return
        const before = col?.getCurrentSpreadIndex?.() ?? -1
        if (dir === 'next') pf.flipNext('bottom')
        else pf.flipPrev('bottom')
        const after = col?.getCurrentSpreadIndex?.() ?? -1
        if (after === before) {
          // 上一次动画还在进行（库会丢弃重叠请求）：稍后重试，不计入已走步数
          stepTimersRef.current.push(window.setTimeout(step, 120))
          return
        }
        done += 1
        stepTimersRef.current.push(window.setTimeout(step, 40))
      }
      stepTimersRef.current.push(window.setTimeout(step, 0))
    },
    getCurrentSpread: () => pageFlipRef.current?.getPageCollection?.()?.getCurrentSpreadIndex?.() ?? 0,
    getCurrentPage: () => pageFlipRef.current?.getCurrentPageIndex() ?? 0,
    getPageCount: () => pageFlipRef.current?.getPageCount() ?? 0,
    refresh: () => pageFlipRef.current?.getUI?.().update?.(),
  }), [pendingEl, mountKey])

  const retry = useCallback(() => {
    setRuntimeError(false)
    // 移掉失败的 script 标签，并换一个新容器
    document.querySelector(`script[data-${SCRIPT_FLAG}]`)?.remove()
    setRetryNonce((n) => n + 1)
  }, [])

  return (
    // 容器 key 覆盖建实例 effect 的全部输入（mountKey / portrait / retryNonce）：
    // 任何会让 effect 重跑的输入都必须同时换掉容器 DOM，否则会在被 destroy 过的
    // 脏容器上重建实例，页元素全丢（见文件头容器 key 不变式）。
    <div
      key={`${mountKey}:${portrait ? 'portrait' : 'landscape'}:${retryNonce}`}
      ref={setContainer}
      className="art-flipbook-container"
    >
      {pages.map((page, i) => (
        <div
          key={i}
          className="art-flip-page"
          data-density={i === 0 || i === pages.length - 1 ? 'hard' : 'soft'}
        >
          {page}
        </div>
      ))}
      {runtimeError && (
        <div className="art-flip-fallback" role="alert">
          <p>翻页组件加载失败</p>
          <button type="button" onClick={retry}>重新加载</button>
        </div>
      )}
    </div>
  )
})

export default ArtFlipBook
