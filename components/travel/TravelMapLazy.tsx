'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamicImport from 'next/dynamic'
import { Skeleton } from '@/components/mobile/Skeleton'
import type { ChinaMapProps } from '@/components/ChinaMap'

/**
 * 旅程页地图「懒挂载」壳（移动端性能专项 E2，2026-11-23）
 * ---------------------------------------------------------------------------
 * 问题：/travel 首屏的地图卡片会连带拉 china-geo 那个 chunk
 *   （明文 585KB / gzip ≈ 202KB）+ d3-geo。它虽然是 dynamic({ssr:false})，
 *   但只要组件一挂载就会立刻开始下载，和「列表正文的首屏渲染」抢同一条 0.8Mbps
 *   带宽（实测：内容 5.0s 出来，geo chunk 5.3s 才开始、13s 还没下完，
 *   地图卡片一直是空白）。
 *
 * 现在拆成两层：
 *   1) 首帧只渲染与地图等高的骨架（父容器本身就是 h-[310px]，不会 CLS）；
 *   2) 骨架进入视口（IntersectionObserver，rootMargin 160px 提前量）后，
 *      再等两帧 rAF + requestIdleCallback 才开始下载地图 chunk —— 保证
 *      「正文已经画出来」才去占带宽；低端机长任务里 rIC 会顺延，最多 1.2s 超时兜底；
 *   3) 用户先摸/点到地图区域时立即挂载（点省份开抽屉不能被 idle 拖住）。
 *
 * 交互契约不变：省份点击仍走 onProvinceSelect → 父级 MobileProvinceDrawer，
 * 只是地图就绪时间从「首屏立刻」变成「首屏之后」。
 */
const ChinaMap = dynamicImport(() => import('@/components/ChinaMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

/** 首帧后的空闲调度（Safari/WKWebView 没有 rIC，退化为 300ms 定时器） */
function onIdle(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const w = window as IdleWindow
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(cb, { timeout: 1200 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(cb, 300)
  return () => window.clearTimeout(id)
}

/** 与真实地图同尺寸的占位：父级已固定 310px 高，这里只负责「不塌陷 + 有反馈」 */
export function MapSkeleton() {
  return (
    <div className="absolute inset-0" role="img" aria-label="足迹地图加载中">
      <Skeleton className="h-full w-full rounded-none" />
    </div>
  )
}

export default function TravelMapLazy(props: ChinaMapProps) {
  const [mounted, setMounted] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let frame = 0
    let cancelIdle = () => {}

    const mount = () => {
      if (!disposed) setMounted(true)
    }
    // 双 rAF：先让这一帧画出来（列表正文已经在屏幕上了），再排 idle
    const schedule = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          cancelIdle = onIdle(mount)
        })
      })
    }

    if (typeof IntersectionObserver !== 'function') {
      schedule()
      return () => {
        disposed = true
        cancelAnimationFrame(frame)
        cancelIdle()
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        schedule()
      },
      // 地图卡片常驻首屏，这条主要是「用户滚回来才加载」的兜底
      { rootMargin: '160px 0px' },
    )
    observer.observe(host)

    return () => {
      disposed = true
      observer.disconnect()
      cancelAnimationFrame(frame)
      cancelIdle()
    }
  }, [])

  // 先摸到就先加载：手势意图优先于空闲调度
  const mountNow = useCallback(() => setMounted(true), [])

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full"
      aria-busy={!mounted}
      onPointerDown={mountNow}
      onTouchStart={mountNow}
    >
      {mounted ? <ChinaMap {...props} /> : <MapSkeleton />}
    </div>
  )
}
