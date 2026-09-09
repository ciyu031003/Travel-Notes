'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * iOS 数字动画：挂载后从上一个值缓动滚动到目标值（easeOutCubic，默认 700ms），
 * prefers-reduced-motion 或 SSR 环境直接显示终值，不影响可读性。
 */
export function CountUp({
  value,
  duration = 700,
  className,
  mobileOnly = false,
}: {
  value: number
  duration?: number
  className?: string
  /** 仅移动端播放数字动画；桌面端直接显示终值（零回归） */
  mobileOnly?: boolean
}) {
  // 初值直接取终值：SSR/首帧渲染即显示正确数字，避免“0 篇旅途”闪白；
  // fromRef 从 0 起步，挂载后仍会播放 0 → value 的入场缓动。
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (duration <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }
    if (mobileOnly && window.matchMedia('(min-width: 768px)').matches) {
      setDisplay(value)
      return
    }
    const from = fromRef.current
    fromRef.current = value
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration, mobileOnly])

  return <span className={className}>{display}</span>
}
