'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import ExpenseCard from './ExpenseCard'
import type { ExpenseDeckData } from '@/lib/expense-card/types'

/**
 * 账单牌堆（旅程归档后的费用卡片浮层）
 * ============================================================================
 * 需求：记录并归档账本后，屏幕中央弹出本次旅途的费用卡片 —— 一笔花销一张，
 * 左右滑动切换查看金额。参考相册的堆叠牌堆（PhotoDeck 的同一套手感）：
 *
 *   · 所有卡片以 3D 扇形叠在中央，最上面的是当前卡；
 *   · 手指左右拖动顶卡：向左 = 下一张，向右 = 上一张（送到底部/抽回顶部）；
 *   · 拖拽时卡片跟着手指 3D 倾斜，松手回弹，越过阈值才切换（带震感）；
 *   · 每张卡底部的银色涂层可以用手指刮开，看人均分摊/付款人/备注。
 *
 * 为什么用 useDragControls 而不是直接 drag：卡片里有「刮涂层」这个同样吃手势的
 * 子区域。若整个卡面都是拖拽热区，刮涂层时会同时把卡片拖走。这里改成手动启动：
 * 只有按在涂层以外的地方才开始拖拽，涂层内部的手势完全归涂层。
 */

const SWIPE_THRESHOLD = 84
const VELOCITY_THRESHOLD = 520
const MAX_VISIBLE = 4
const DEPTH_TILT = 3.4
const DEPTH_SCALE = 0.045
const DEPTH_Y = 9
const TILT_X = 8
const TILT_Y = 12

export interface ExpenseDeckProps {
  deck: ExpenseDeckData
  onClose: () => void
  /** 底部可选动作：打开这段旅程 */
  onOpenTravel?: () => void
}

export default function ExpenseDeck({ deck, onClose, onOpenTravel }: ExpenseDeckProps) {
  const reduceMotion = useReducedMotion()
  const cards = deck.cards
  const total = cards.length
  /** 牌堆顺序：数组末尾 = 顶卡；初始让第 0 张在最上面 */
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i).reverse())
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-120, 120], [TILT_X, -TILT_X])
  const rotateY = useTransform(x, [-120, 120], [-TILT_Y, TILT_Y])
  /** 当前顶卡是哪一笔（用于底部指示与无障碍播报） */
  const topIndex = order.length > 0 ? order[order.length - 1] : 0
  const current = cards[topIndex]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goNext()
      if (e.key === 'ArrowRight') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // goNext/goPrev 用 ref 语义（只依赖 order），这里直接复用下方 useCallback 的稳定引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  /** 下一张：顶卡送到底部 */
  const goNext = useCallback(() => {
    setOrder((prev) => {
      if (prev.length <= 1) return prev
      const top = prev[prev.length - 1]
      return [top, ...prev.slice(0, -1)]
    })
    x.set(0)
    y.set(0)
    void hapticLight()
  }, [x, y])

  /** 上一张：把最底下那张抽回顶部 */
  const goPrev = useCallback(() => {
    setOrder((prev) => {
      if (prev.length <= 1) return prev
      return [...prev.slice(1), prev[0]]
    })
    x.set(0)
    y.set(0)
    void hapticLight()
  }, [x, y])

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      const passed = Math.abs(info.offset.x) > SWIPE_THRESHOLD || Math.abs(info.velocity.x) > VELOCITY_THRESHOLD
      if (passed) {
        // 向左滑 = 看下一张；向右滑 = 回到上一张
        if (info.offset.x < 0) goNext()
        else goPrev()
      }
      x.set(0)
      y.set(0)
    },
    [goNext, goPrev, x, y],
  )

  const dots = useMemo(() => cards.map((_, i) => i), [cards])
  const ariaLabel = current ? `第 ${topIndex + 1} 张，共 ${total} 张：${current.label} ${current.currencySymbol}${current.amountText}` : ''

  return (
    <div className="ecdeck-backdrop" role="dialog" aria-modal="true" aria-label="旅程账单费用卡片">
      <div className="ecdeck-head">
        <div className="min-w-0">
          <p className="ecdeck-eyebrow">旅程账单 · 已归档</p>
          <h2 className="ecdeck-title truncate">{deck.travelTitle}</h2>
        </div>
        <button type="button" className="ecdeck-close" aria-label="关闭账单" onClick={onClose}>
          <Icon icon={X} size="sm" />
        </button>
      </div>

      <div className="ecdeck-stage">
        <div className="ecdeck-stack" aria-live="polite" aria-label={ariaLabel}>
          {order.map((cardIndex, depthFromBottom) => {
            const depth = order.length - 1 - depthFromBottom
            const isTop = depth === 0
            if (depth >= MAX_VISIBLE) return null
            const card = cards[cardIndex]
            if (!card) return null
            const scale = 1 - depth * DEPTH_SCALE
            const rotateZ = depth === 0 ? 0 : (depth % 2 === 0 ? -1 : 1) * depth * DEPTH_TILT
            return (
              <motion.div
                key={card.id}
                className="ecdeck-card"
                initial={false}
                animate={{
                  scale,
                  rotateZ,
                  y: depth * DEPTH_Y,
                  opacity: 1,
                }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }
                }
                drag={isTop ? 'x' : false}
                dragListener={false}
                dragControls={isTop ? dragControls : undefined}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                onDragEnd={isTop ? handleDragEnd : undefined}
                onPointerDown={
                  isTop
                    ? (e) => {
                        // 涂层内部的手势归涂层（刮开），别把卡片拖走
                        const target = e.target as HTMLElement
                        if (target.closest('.ecard-scratch')) return
                        dragControls.start(e)
                      }
                    : undefined
                }
                // 顶卡（depth 0）必须在最上层：zIndex 随 depth 递减。
                // x/y 与倾斜直接挂在**可拖拽元素本身**上（motion 的 drag 就是改这个元素的
                // x/y 位移），这样拖动时卡片跟手 + 3D 倾斜是同一套数值，不会各走各的。
                style={{
                  zIndex: order.length - depth,
                  ...(isTop
                    ? {
                        x,
                        y,
                        rotateX: reduceMotion ? 0 : rotateX,
                        rotateY: reduceMotion ? 0 : rotateY,
                        touchAction: 'none' as const,
                      }
                    : {}),
                }}
              >
                <div className="h-full w-full [transform-style:preserve-3d]">
                  <ExpenseCard card={card} travelTitle={deck.travelTitle} />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="ecdeck-foot">
        <div className="ecdeck-total">
          <span className="ecdeck-total-label">共 {total} 笔</span>
          <span className="ecdeck-total-value">{deck.totalText}</span>
        </div>
        {deck.perPersonText ? <p className="ecdeck-perperson">{deck.perPersonText}</p> : null}
        <div className="ecdeck-dots" aria-hidden="true">
          {dots.map((i) => (
            <span key={i} className={'ecdeck-dot' + (i === topIndex ? ' is-on' : '')} />
          ))}
        </div>
        <div className="mt-1 flex w-full items-center justify-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={order.length <= 1}
            aria-label="上一张"
            className="flex h-10 w-16 items-center justify-center rounded-full border border-[var(--m-line)] text-[var(--m-text)] disabled:opacity-40"
          >
            <Icon icon={ChevronLeft} size="sm" />
          </button>
          {onOpenTravel ? (
            <button type="button" onClick={onOpenTravel} className="m-btn m-btn-ghost h-10 px-4 text-[13px]">
              查看这段旅程
            </button>
          ) : null}
          <button
            type="button"
            onClick={goNext}
            disabled={order.length <= 1}
            aria-label="下一张"
            className="flex h-10 w-16 items-center justify-center rounded-full border border-[var(--m-line)] text-[var(--m-text)] disabled:opacity-40"
          >
            <Icon icon={ChevronRight} size="sm" />
          </button>
        </div>
      </div>
    </div>
  )
}
