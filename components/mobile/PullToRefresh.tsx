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

/**
 * iOS 下拉刷新：window 级滚动容器，下拉阻尼回弹，到阈值松手触发（带 medium 触觉）。
 *
 * iOS 化观感（2.0）：
 * - 纯 spinner、无文字（iOS 惯例）；spinner 跟手旋转（进度 ×180°，过阈值锁定）；
 * - 松手未触发 / 刷新完成 → 内容弹簧收位（不再是瞬移归零）。
 */
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
  /** 松手后的弹簧收位阶段：位移归零但保留回弹过渡 */
  const [settling, setSettling] = useState(false)

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

  const settle = () => {
    setDist(0)
    setSettling(true)
    window.setTimeout(() => setSettling(false), 420)
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
        settle()
      })
    } else {
      settle()
    }
  }

  const ready = dist >= THRESHOLD
  // 跟手旋转：0° → 180°，过阈值锁定（iOS spinner 行为）；刷新中交给 CSS 连续旋转
  const dragRotation = Math.min(180, (dist / THRESHOLD) * 180)

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
          style={
            refreshing
              ? undefined
              : {
                  transform: `rotate(${dragRotation}deg)`,
                  transition: settling ? 'transform 0.4s var(--m-ease-spring)' : 'none',
                }
          }
        />
      </div>
      <div
        style={
          /*
           * ⚠️ 静止时必须**不设 transform**（而不是 translateY(0px)）。
           *
           * CSS 里任何非 none 的 transform 都会让该元素成为 position:fixed 后代的
           * **包含块**。此前这里恒写 translateY(0px)，于是子树里所有 fixed 元素
           * （省份抽屉、底部 CTA 等）不再相对视口定位，而是相对这层内容容器 ——
           * 真机表现：在地图页点省份，弹窗跑到**整页内容的最底部**，
           * 必须一直往下拉才能看到（用户反馈的 bug）。
           *
           * 现在三态处理：
           *   · 下拉中   → translateY(dist)，跟随手指（此时不会打开弹窗）
           *   · 回弹中   → translateY(0px) + 弹簧过渡（保留动画）
           *   · 静止     → 不写 transform（恢复视口定位）
           */
          dist > 0
            ? { transform: `translateY(${dist}px)`, transition: 'none' }
            : settling
              ? { transform: 'translateY(0px)', transition: 'transform 0.4s var(--m-ease-spring)' }
              : undefined
        }
      >
        {children}
      </div>
    </div>
  )
}
