'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Images } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 堆叠相册（2026-10-12 新增）
 * ============================================================================
 * 需求：旅行圈详情页顶部的图片改成**堆叠样式**，用户可以左右滑动**或**上下滑动切换。
 *
 * 为什么新写而不是复用 components/StackedImageSlider：
 *   · 那个组件只有横向手势，没有纵向；
 *   · 它带 6s 自动轮播（setInterval）—— 违反《移动端设计规范》§1 第 3 条
 *     「除 loading 外禁止无限循环动画」，且会打扰阅读；
 *   · 它内部写死渐变与 hex，不符合 token 规范。
 *   本组件只做"堆叠 + 双向手势 + 点击打开大图"，无自动播放。
 *
 * 交互细节（都为了"原生感"）：
 *   · 手势四向判定：以主轴方向决定切换，斜向滑动按位移更大的轴走（阈值 42px）；
 *   · 跟手位移：拖动时卡片实时跟随（transform），松手按阈值决定切换或回弹；
 *   · 轻触觉：每次成功切换给一次 hapticLight；
 *   · 点击当前卡 → 打开全屏查看器（由父级给 onOpen）；
 *   · 非当前卡只做视觉堆叠（缩放 + 偏移 + 透明度），不响应点击，避免误触。
 */

interface StackedGalleryProps {
  images: string[]
  alt: string
  className?: string
  /** 点击当前卡片（父级通常打开全屏 PhotoViewer） */
  onOpen?: (index: number) => void
}

/** 切换阈值：超过这个位移才认作"切换"，否则回弹 */
const SWITCH_THRESHOLD = 42

export default function StackedGallery({ images, alt, className, onOpen }: StackedGalleryProps) {
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const total = images.length

  const goTo = useCallback(
    (next: number) => {
      if (total === 0) return
      const wrapped = ((next % total) + total) % total
      setIndex((prev) => {
        if (prev !== wrapped) void hapticLight()
        return wrapped
      })
    },
    [total],
  )

  const onTouchStart = (e: React.TouchEvent) => {
    if (total <= 1) return
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY }
    setDrag({ x: 0, y: 0 })
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return
    const t = e.touches[0]
    setDrag({ x: t.clientX - startRef.current.x, y: t.clientY - startRef.current.y })
  }

  const onTouchEnd = () => {
    const d = drag
    startRef.current = null
    setDrag(null)
    if (!d) return
    // 主轴判定：横向位移更大 → 左右切换；纵向更大 → 上下切换
    if (Math.abs(d.x) >= Math.abs(d.y)) {
      if (d.x <= -SWITCH_THRESHOLD) goTo(index + 1)
      else if (d.x >= SWITCH_THRESHOLD) goTo(index - 1)
    } else {
      if (d.y <= -SWITCH_THRESHOLD) goTo(index + 1)
      else if (d.y >= SWITCH_THRESHOLD) goTo(index - 1)
    }
  }

  if (total === 0) return null

  return (
    <div className={cn('relative select-none', className)} data-no-swipeback>
      <div
        className="relative aspect-[4/5] w-full touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {images.map((src, i) => {
          // 相对当前卡的偏移；环形取最短路径，让"上一张"出现在左侧
          const raw = i - index
          const offset = raw > total / 2 ? raw - total : raw < -total / 2 ? raw + total : raw
          const abs = Math.abs(offset)
          const isCurrent = offset === 0
          // 只渲染前 3 层，后面的完全透明（省内存，也不会在边缘露出）
          const visible = abs <= 2
          // 跟手：仅当前卡跟随拖动，后面的卡片做轻微视差
          const dx = drag?.x ?? 0
          const dy = drag?.y ?? 0

          return (
            <button
              key={src + i}
              type="button"
              tabIndex={isCurrent ? 0 : -1}
              aria-hidden={!isCurrent}
              aria-label={isCurrent ? `查看第 ${i + 1} 张图片` : undefined}
              onClick={() => {
                if (isCurrent) onOpen?.(index)
              }}
              className={cn(
                'absolute inset-0 overflow-hidden rounded-2xl ring-1 ring-[var(--social-line)]',
                'bg-[var(--social-surface2)]',
                isCurrent ? 'cursor-pointer' : 'pointer-events-none',
              )}
              style={{
                transform: `translate3d(${offset * 18 + (isCurrent ? dx : dx * 0.25)}px, ${offset * -10 + (isCurrent ? dy : 0)}px, 0) scale(${1 - abs * 0.06})`,
                zIndex: 30 - abs,
                opacity: visible ? (abs === 0 ? 1 : abs === 1 ? 0.55 : 0.25) : 0,
                transition: drag ? 'none' : 'transform 0.42s var(--m-ease-out), opacity 0.42s ease-out',
              }}
            >
              <Image
                src={src}
                alt={alt}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority={i === 0}
                draggable={false}
              />
            </button>
          )
        })}

        {/* 计数徽标 */}
        {total > 1 && (
          <div className="pointer-events-none absolute right-3 top-3 z-40 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <Icon icon={Images} size="sm" />
            {index + 1} / {total}
          </div>
        )}

        {/* 左右切换按钮：桌面端/大屏可用，移动端主要走手势 */}
        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              onClick={() => goTo(index - 1)}
              className="m-press absolute left-3 top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md sm:flex"
            >
              <Icon icon={ChevronLeft} size="md" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              onClick={() => goTo(index + 1)}
              className="m-press absolute right-3 top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md sm:flex"
            >
              <Icon icon={ChevronRight} size="md" />
            </button>
          </>
        )}
      </div>

      {/* 指示点（可点跳转） */}
      {total > 1 && total <= 12 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`第 ${i + 1} 张`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === index
                  ? 'w-6 bg-[var(--social-accent)]'
                  : 'w-1.5 bg-[var(--social-line-strong)]',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
