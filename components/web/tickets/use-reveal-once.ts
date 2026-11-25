'use client'

import { useEffect, useRef, useState } from 'react'

/** 桌面版从此宽度开始接管（与 web-tickets.css 的第 0 节保持一致） */
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * 滚动一次性渐入（IntersectionObserver）
 * ---------------------------------------------------------------------------
 * 进入视口 → 加 is-in（CSS 负责过渡），随后立刻 disconnect：
 *  · 列表很长时不会留下几十个 observer；
 *  · 只播一次，来回滚动不会反复闪烁。
 *
 * 两个必须处理的现实路径：
 *  1) 没有 IntersectionObserver（老 WebView / 测试环境）→ 直接显示，
 *     绝不让"动画没跑起来"变成"内容看不见"；
 *  2) 从 <1024 拖宽到 ≥1024（或平板横竖屏切换）：本组件整块从 display:none
 *     变为可见，Chromium 不保证对"重新可见"的子树补发 IO 回调，于是内容会
 *     停在 opacity:0。因此监听断点变化，切到桌面时重建 observer 并手动补一次
 *     可见性判定。
 */
export function useRevealOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [shown, setShown] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      doneRef.current = true
      setShown(true)
      return
    }

    let observer: IntersectionObserver | null = null

    const mark = () => {
      if (doneRef.current) return
      doneRef.current = true
      setShown(true)
    }

    const inViewport = () => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight * 0.94 && rect.bottom > 0
    }

    const watch = (checkNow: boolean) => {
      observer?.disconnect()
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            mark()
            observer?.disconnect()
            return
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.04 },
      )
      observer.observe(el)
      if (checkNow && inViewport()) mark()
    }

    watch(false)

    const mq = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null
    const onBreakpointChange = () => {
      if (doneRef.current) return
      // 切到桌面才需要重新接管；缩回移动端保持原状态即可
      if (mq?.matches) watch(true)
    }
    mq?.addEventListener('change', onBreakpointChange)

    return () => {
      observer?.disconnect()
      mq?.removeEventListener('change', onBreakpointChange)
    }
  }, [])

  return { ref, shown }
}
