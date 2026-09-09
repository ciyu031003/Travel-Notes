'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/* ==========================================================================
   ArtFlipBook — 基于 St.PageFlip 的 React 封装
   提供 3D 翻页效果，适用于摄影画册（Art Mode）
   源自 create-photo-flipbook-ui skill 的 vendor 库
   ========================================================================== */

export interface ArtFlipBookHandle {
  flipNext: () => void
  flipPrev: () => void
  turnToPage: (page: number) => void
  getCurrentPage: () => number
  getPageCount: () => number
}

interface ArtFlipBookProps {
  /** 页面内容数组（React 节点） */
  pages: React.ReactNode[]
  /** 翻页动画时长（ms） */
  flippingTime?: number
  /** 单页（竖排）模式：窄屏 true 一页一页翻；宽屏 false 双页展开（横屏照片真跨页） */
  portrait?: boolean
  /** 页面切换回调 */
  onPageChange?: (pageIndex: number, spreadIndex?: number, spreadTotal?: number) => void
  /** 外部控制当前页 */
  currentPage?: number
}

/**
 * ArtFlipBook — 3D 翻页画册组件
 *
 * 封装 St.PageFlip 库，提供：
 * - 真实 3D 翻页动画（模拟纸页弯曲/阴影）
 * - 触摸/鼠标/键盘翻页
 * - 跨页模式（桌面双页，移动单页）
 * - 边缘点击、滑动翻页
 */
const ArtFlipBook = forwardRef<ArtFlipBookHandle, ArtFlipBookProps>(function ArtFlipBook(
  { pages, flippingTime = 760, portrait = true, onPageChange, currentPage },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageFlipRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const onPageChangeRef = useRef(onPageChange)
  const syncingRef = useRef(false)

  // 保持回调引用最新
  onPageChangeRef.current = onPageChange

  // 动态加载 vendored page-flip 库
  useEffect(() => {
    if (typeof (window as any).St?.PageFlip !== 'undefined') {
      setReady(true)
      return
    }
    const script = document.createElement('script')
    script.src = '/vendor/page-flip.browser.js'
    script.async = false
    script.onload = () => setReady(true)
    script.onerror = () => console.error('page-flip.browser.js 加载失败')
    document.head.appendChild(script)
    return () => {
      script.remove()
    }
  }, [])

  // 初始化 PageFlip 实例
  useEffect(() => {
    if (!ready || !containerRef.current) return

    const St = (window as any).St
    if (!St?.PageFlip) return

    const container = containerRef.current
    const pageElements = container.querySelectorAll<HTMLElement>('.art-flip-page')

    // 首次初始化
    const pageFlip = new St.PageFlip(container, {
      width: 512,
      height: 640,
      size: 'stretch',
      minWidth: Math.max(1, Math.round(512 * 0.56)),
      maxWidth: Math.max(1, Math.round(512 * 1.04)),
      minHeight: Math.max(1, Math.round(640 * 0.56)),
      maxHeight: Math.max(1, Math.round(640 * 1.04)),
      drawShadow: true,
      flippingTime,
      usePortrait: portrait,
      startZIndex: 10,
      autoSize: true,
      maxShadowOpacity: 0.42,
      showCover: true,
      mobileScrollSupport: false,
      clickEventForward: true,
      useMouseEvents: true,
      swipeDistance: 24,
      showPageCorners: true,
      disableFlipByClick: false,
    })

    pageFlip.loadFromHTML(pageElements)

    // 把「当前翻动单位」一并上报：landscape 双页展开下 spread 数才是总页数，
    // 单页（portrait）模式下 spread 即页面本身，两种模式同一条路径。
    const reportCurrent = (pf: any) => {
      const col = pf?.getPageCollection?.()
      let spreadIndex: number | undefined
      let spreadTotal: number | undefined
      if (col) {
        const spreads = col.getSpread?.()
        if (Array.isArray(spreads)) {
          spreadIndex = col.getCurrentSpreadIndex?.()
          spreadTotal = spreads.length
        }
      }
      onPageChangeRef.current?.(pf?.getCurrentPageIndex?.() ?? 0, spreadIndex, spreadTotal)
    }

    pageFlip.on('init', () => reportCurrent(pageFlip))
    pageFlip.on('update', () => reportCurrent(pageFlip))
    pageFlip.on('flip', () => {
      if (syncingRef.current) return
      reportCurrent(pageFlip)
    })

    pageFlipRef.current = pageFlip

    return () => {
      try {
        pageFlip.destroy()
      } catch {
        // StrictMode 双挂载时容器可能已被 React 移除
      }
      pageFlipRef.current = null
    }
  }, [ready, flippingTime, portrait])

  // 页面内容变化时同步到已初始化的实例（保留当前页码）
  useEffect(() => {
    if (!ready || !pageFlipRef.current || !containerRef.current) return
    const pageElements = containerRef.current.querySelectorAll<HTMLElement>('.art-flip-page')
    pageFlipRef.current.updateFromHtml(pageElements)
  }, [ready, pages])

  // 从外部同步当前页
  useEffect(() => {
    if (!pageFlipRef.current || currentPage === undefined) return
    if (pageFlipRef.current.getCurrentPageIndex() === currentPage) return
    syncingRef.current = true
    pageFlipRef.current.turnToPage(currentPage)
    // 等待翻页动画完成后再允许事件回传
    const timer = setTimeout(() => { syncingRef.current = false }, flippingTime + 100)
    return () => clearTimeout(timer)
  }, [currentPage, flippingTime])

  // 暴露命令式 API
  useImperativeHandle(ref, () => ({
    flipNext: () => pageFlipRef.current?.flipNext('bottom'),
    flipPrev: () => pageFlipRef.current?.flipPrev('bottom'),
    turnToPage: (p: number) => pageFlipRef.current?.turnToPage(p),
    getCurrentPage: () => pageFlipRef.current?.getCurrentPageIndex() ?? 0,
    getPageCount: () => pageFlipRef.current?.getPageCount() ?? 0,
  }), [])

  return (
    <div
      ref={containerRef}
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
    </div>
  )
})

export default ArtFlipBook
