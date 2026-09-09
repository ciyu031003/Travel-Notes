'use client'

import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

/**
 * iOS 列表入场：为首屏子元素注入递增 animation-delay（每项 step 毫秒），
 * 仅数据首次挂载时触发，滚动/刷新不会重复播放；
 * 通过 --m-delay 变量驱动 animation-delay，避免覆盖子元素既有动画类。
 */
export function Stagger({
  children,
  step = 36,
  delayBase = 0,
  className,
  style,
}: {
  children: ReactNode
  /** 相邻两项入场间隔（毫秒） */
  step?: number
  /** 首个元素的额外延迟（毫秒） */
  delayBase?: number
  className?: string
  style?: CSSProperties
}) {
  const items = Children.toArray(children)
  return (
    <div className={className} style={style}>
      {items.map((child, index) => {
        if (!isValidElement(child)) return child
        const prev = (child.props as { style?: CSSProperties }).style
        const delay = delayBase + index * step
        const nextStyle = { ...prev, ['--m-delay' as string]: `${delay}ms` } as CSSProperties
        const nextClass = cn(
          (child.props as { className?: string }).className,
          !(child.props as { className?: string }).className?.includes('m-enter') && 'm-list-item',
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return cloneElement(child as any, { style: nextStyle, className: nextClass })
      })}
    </div>
  )
}
