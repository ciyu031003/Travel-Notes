'use client'

import { forwardRef, type ButtonHTMLAttributes, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'

export interface PressableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按压时是否触发 light 触觉（默认 true） */
  haptics?: boolean
}

/**
 * 统一按压反馈：scale(0.97) + 可选触觉，保证最小触达习惯（44px 由使用方按需设置）。
 */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { className, haptics = true, onPointerDown, onClick, ...rest },
  ref,
) {
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (haptics) void hapticLight()
    onPointerDown?.(event)
  }

  return (
    <button
      ref={ref}
      type="button"
      onPointerDown={handlePointerDown}
      onClick={onClick}
      className={cn('m-pressable', className)}
      {...rest}
    />
  )
})
