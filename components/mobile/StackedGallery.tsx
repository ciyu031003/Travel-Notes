'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Images } from "lucide-react"
import { Icon } from "@/components/mobile/Icon"
import { hapticLight } from "@/lib/mobile/haptics"
import { cn } from "@/lib/utils"

/**
 * 堆叠相册（2026-10-13 重做动效）
 * ============================================================================
 * 需求：顶部图片堆叠展示，左右滑动**或**上下滑动切换。
 *
 * 上一版的问题（真机反馈「切换还保留上一张内容、能明显看到过渡没做好、卡顿」）：
 *   ① 离场卡只偏移 18px、透明度留 0.55 —— 旧图**一直留在屏幕里**，看起来没切干净；
 *   ② 所有卡共用同一 offset 公式，没有「离场 / 入场」的区分，切换像是整体挪了一下；
 *   ③ 拖动时每个 touchmove 都 setState 触发整棵子树重渲染 → 掉帧；
 *   ④ 拖动用 transition:none、松手直接跳到终点，缺一段收尾过渡。
 *
 * 现在改为**方向感知的三态模型**：
 *   · active  当前卡：居中、全不透明、跟手位移；
 *   · peek    入场卡：停在行进方向一侧（缩小 + 略透明），指示「还有下一张」；
 *   · leave   离场卡：沿**反方向完全滑出屏幕**（translate ±104%），不再残留。
 * 三态由 dir（1 前进 / -1 后退）决定，前进后退都对称成立。
 *
 * 流畅度：
 *   · touchmove 用 requestAnimationFrame 节流，拖动期间不重建子树；
 *   · 拖动跟手用无过渡，松手立刻恢复弹簧过渡（有收尾，不是硬跳）；
 *   · 卡片声明 will-change，避免拖动时反复合成；
 *   · 无自动轮播（规范 §1 第 3 条禁止 loading 之外的无限动画）。
 */

interface StackedGalleryProps {
  images: string[]
  alt: string
  className?: string
  /** 点击当前卡片（父级通常打开全屏查看器） */
  onOpen?: (index: number) => void
}

/** 切换阈值：超过这个位移才认作"切换"，否则回弹 */
const SWITCH_THRESHOLD = 42
/** 离场位移：略微超过 100% 保证完全离开视口，不留边 */
const LEAVE_X = 104

export default function StackedGallery({ images, alt, className, onOpen }: StackedGalleryProps) {
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef(0)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)
  const total = images.length

  const goTo = useCallback(
    (next: number) => {
      if (total === 0) return
      const wrapped = ((next % total) + total) % total
      setIndex((prev) => {
        if (prev === wrapped) return prev
        // 方向按**原始索引差值的符号**判定（不用环形距离）：
        // 只有 2 张图时环形距离两向都是 1，会恒判为前进，导致后退动画方向反了。
        setDir(next >= prev ? 1 : -1)
        void hapticLight()
        return wrapped
      })
    },
    [total],
  )

  // 组件卸载时清掉挂起的动画帧
  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }, [])

  const onTouchStart = (e: React.TouchEvent) => {
    if (total <= 1) return
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY }
    pendingRef.current = { x: 0, y: 0 }
    setDrag({ x: 0, y: 0 })
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return
    const t = e.touches[0]
    pendingRef.current = { x: t.clientX - startRef.current.x, y: t.clientY - startRef.current.y }
    // rAF 节流：一帧最多一次 setState，避免拖动时连续重渲染造成掉帧
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      if (pendingRef.current) setDrag(pendingRef.current)
    })
  }

  const onTouchEnd = () => {
    const d = drag
    startRef.current = null
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = 0 }
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

  /** 当前卡相对位移（跟手）；其余卡按方向给出固定位置 */
  const dx = drag?.x ?? 0
  const dy = drag?.y ?? 0

  const styleFor = (pos: number) => {
    const isActive = pos === 0
    // 入场卡：位于行进方向那一侧，缩小并略透明，暗示"还有内容"
    const isPeek = pos === dir
    // 离场卡：位于行进反方向，完全滑出屏幕（这是"切不干净"的根治点）
    const isLeave = pos === -dir

    if (isActive) {
      return {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)`,
        opacity: 1,
        zIndex: 30,
        transition: drag ? "none" : "transform 0.42s var(--m-ease-spring), opacity 0.28s ease-out",
      }
    }
    if (isPeek) {
      return {
        // 跟手时让入场卡同步靠近，形成"两卡联动"的堆叠感
        transform: `translate3d(${dir * 16 + dx * 0.28}px, ${-10 + dy * 0.28}px, 0) scale(0.93)`,
        opacity: 0.6,
        zIndex: 29,
        transition: drag ? "none" : "transform 0.42s var(--m-ease-spring), opacity 0.32s ease-out",
      }
    }
    if (isLeave) {
      return {
        // 沿反方向彻底移出（104% 略超一屏，保证边缘不留残影）
        transform: `translate3d(${-dir * LEAVE_X}%, ${dy * 0.2}px, 0) scale(0.98)`,
        opacity: 0,
        zIndex: 28,
        transition: drag ? "none" : "transform 0.42s var(--m-ease-out), opacity 0.3s ease-out",
      }
    }
    // 更远的卡：藏在栈深处，不参与视觉与命中
    return {
      transform: `translate3d(${dir * 26}px, -16px, 0) scale(0.88)`,
      opacity: 0,
      zIndex: 20,
      transition: drag ? "none" : "transform 0.42s var(--m-ease-out), opacity 0.3s ease-out",
    }
  }

  return (
    <div className={cn("relative select-none", className)} data-no-swipeback>
      <div
        className="relative aspect-[4/5] w-full touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {images.map((src, i) => {
          // 相对当前卡的偏移；环形取最短路径，保证"上一张"出现在正确一侧
          const raw = i - index
          const pos = raw > total / 2 ? raw - total : raw < -total / 2 ? raw + total : raw
          const isActive = pos === 0
          return (
            <button
              key={src + i}
              type="button"
              tabIndex={isActive ? 0 : -1}
              aria-hidden={!isActive}
              aria-label={isActive ? `查看第 ${i + 1} 张图片` : undefined}
              onClick={() => { if (isActive) onOpen?.(index) }}
              className={cn(
                "absolute inset-0 overflow-hidden rounded-2xl ring-1 ring-[var(--ui-social-line)]",
                "bg-[var(--ui-social-surface2)] will-change-transform",
                isActive ? "cursor-pointer" : "pointer-events-none",
              )}
              style={styleFor(pos)}
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
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-[var(--ui-social-accent)]" : "w-1.5 bg-[var(--ui-social-line-strong)]",
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
