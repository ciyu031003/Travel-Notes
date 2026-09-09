'use client'

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
} from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticMedium } from '@/lib/mobile/haptics'

const THRESHOLD = 56
const MAX_PULL = 96

/** iOS 下拉刷新：window 级滚动容器，下拉阻尼回弹，到阈值松手触发（带 medium 触觉） */
export function PullToRefresh({
  onRefresh,
  children,
  className,
  style,
  disabled,
}: {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
  className?: string
  style?: CSSProperties
  disabled?: boolean
}) {
  const startY = useRef(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dist, setDist] = useState(0)

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (disabled || refreshing || window.scrollY > 0) return
    startY.current = event.touches[0].clientY
  }

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (disabled || refreshing || window.scrollY > 0) return
    const dy = event.touches[0].clientY - startY.current
    if (dy <= 0) {
      setDist(0)
      return
    }
    setDist(Math.min(MAX_PULL, dy * 0.42))
  }

  const handleTouchEnd = () => {
    if (refreshing) return
    if (dist >= THRESHOLD) {
      void hapticMedium()
      setRefreshing(true)
      setDist(THRESHOLD)
      const result = onRefresh()
      Promise.resolve(result).finally(() => {
        setRefreshing(false)
        setDist(0)
      })
    } else {
      setDist(0)
    }
  }

  const ready = dist >= THRESHOLD

  return (
    <div
      className={cn('m-ptr', className)}
      style={style}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        aria-hidden="true"
        className="m-ptr-indicator"
        style={{
          transform: `translateY(${Math.max(0, dist - 48)}px)`,
          opacity: Math.min(1, dist / THRESHOLD),
        }}
      >
        <RefreshCw
          className={cn('h-5 w-5', refreshing && 'm-ptr-spin')}
          strokeWidth={2}
        />
        <span className="ml-2 text-[12px]">
          {refreshing ? '刷新中…' : ready ? '松开刷新' : '下拉刷新'}
        </span>
      </div>
      <div
        style={{
          transform: `translateY(${dist}px)`,
          transition: dist === 0 ? 'none' : 'transform 0.02s linear',
        }}
      >
        {children}
      </div>
    </div>
  )
}
