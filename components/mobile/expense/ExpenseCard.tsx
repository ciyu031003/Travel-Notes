'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BedDouble, Bus, Coffee, Gift, ShoppingBag, Ticket, type LucideIcon } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import type { ExpenseCardData, ExpenseCategoryKey } from '@/lib/expense-card/types'

/**
 * 费用卡片（一张卡 = 账本里的一笔花销）
 * ---------------------------------------------------------------------------
 * 视觉参考 "Gift card scratch interaction"：高饱和纯色卡面、超大金额、底部一条银色
 * 涂层。这里做成了中文旅行版：
 *   · 左上角「甜途 · 分类」+ 旅程名，右上角分类图标；
 *   · 中间超大金额（¥1,500），下面一行是「12月8日 14:20 · 备注」；
 *   · 底部涂层用手指刮开 → 露出人均分摊 / 付款人 / 备注。
 *
 * 刮涂层的实现：canvas 上画一层金属渐变，pointermove 用 destination-out 擦除；
 * 擦掉超过一半（或键盘/点击）就整层淡出，露出下面的文字。擦除不做逐像素计数
 * （手机上 getImageData 每帧都读回会卡），用「累计擦除路径长度」判断，足够准。
 */

const CATEGORY_ICONS: Record<ExpenseCategoryKey, LucideIcon> = {
  TRANSPORT: Bus,
  HOTEL: BedDouble,
  FOOD: Coffee,
  TICKET: Ticket,
  SHOPPING: ShoppingBag,
  OTHER: Gift,
}

/** 累计擦除路径超过这个长度就算"刮开了"（约等于手指划过两次涂层） */
const SCRATCH_DONE_DISTANCE = 150

export interface ExpenseCardProps {
  card: ExpenseCardData
  /** 卡面左上角的旅程名（不传则不显示第二行） */
  travelTitle?: string
  className?: string
  /** 刮开涂层时回调（用于震动等反馈，默认内部已处理） */
  onReveal?: () => void
}

export default function ExpenseCard({ card, travelTitle, className, onReveal }: ExpenseCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [revealed, setRevealed] = useState(false)
  const scratchRef = useRef({ drawing: false, lastX: 0, lastY: 0, distance: 0 })
  const IconGlyph = CATEGORY_ICONS[card.category] || Gift

  /** 画金属涂层：先铺渐变，再叠几道横向高光，像真的刮刮卡 */
  const paintCoating = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = rect.width
    const h = rect.height
    /**
     * 配色从 CSS 变量读（组件里不写裸色值，设计 token 门禁会拦）：
     * --ec-scratch-1..5 是金属渐变的 5 个色标，--ec-scratch-hi/lo 是丝纹的高光/暗线。
     * 变量缺失（老版本样式表 / 被裁剪）时直接不画涂层 —— 露出内容总比画一块死色好。
     */
    const readVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const stops = [1, 2, 3, 4, 5].map((i) => readVar('--ec-scratch-' + i))
    const hi = readVar('--ec-scratch-hi')
    const lo = readVar('--ec-scratch-lo')
    if (stops.some((s) => !s)) {
      setRevealed(true)
      return
    }
    const gradient = ctx.createLinearGradient(0, 0, w, h)
    gradient.addColorStop(0, stops[0])
    gradient.addColorStop(0.28, stops[1])
    gradient.addColorStop(0.52, stops[2])
    gradient.addColorStop(0.74, stops[3])
    gradient.addColorStop(1, stops[4])
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
    // 横向丝纹
    if (hi && lo) {
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = i % 2 === 0 ? hi : lo
        ctx.lineWidth = 1
        const y = (h / 14) * i + 1
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    }
  }, [])

  useEffect(() => {
    paintCoating()
    const onResize = () => paintCoating()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [paintCoating])

  const finishScratch = useCallback(() => {
    setRevealed((prev) => {
      if (prev) return prev
      void hapticLight()
      onReveal?.()
      return true
    })
  }, [onReveal])

  const erase = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const x = clientX - rect.left
    const y = clientY - rect.top
    const s = scratchRef.current
    const dx = x - s.lastX
    const dy = y - s.lastY
    if (s.distance === 0) {
      s.lastX = x
      s.lastY = y
    }
    s.distance += Math.hypot(dx, dy)
    s.lastX = x
    s.lastY = y

    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(x, y, 22, 0, Math.PI * 2)
    ctx.fill()
    // 把上一点到当前点之间也擦一遍，手指快速划过不会断线
    ctx.beginPath()
    ctx.arc((x + s.lastX) / 2, (y + s.lastY) / 2, 18, 0, Math.PI * 2)
    ctx.fill()

    if (s.distance > SCRATCH_DONE_DISTANCE) finishScratch()
  }, [finishScratch])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation()
    if (revealed) return
    const canvas = canvasRef.current
    canvas?.setPointerCapture(e.pointerId)
    scratchRef.current = { drawing: true, lastX: 0, lastY: 0, distance: 0 }
    erase(e.clientX, e.clientY)
  }, [erase, revealed])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scratchRef.current.drawing || revealed) return
    e.stopPropagation()
    erase(e.clientX, e.clientY)
  }, [erase, revealed])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation()
    scratchRef.current.drawing = false
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* 已经释放 */
    }
  }, [])

  return (
    <div className={`ecard ecard--${card.category.toLowerCase()}${className ? ' ' + className : ''}`}>
      <div className="ecard-inner">
        <div className="ecard-head">
          <div className="min-w-0">
            <p className="ecard-brand">甜途 · {card.label}</p>
            {travelTitle ? <p className="ecard-trip">{travelTitle}</p> : null}
          </div>
          <span className="ecard-icon" aria-hidden="true">
            <Icon icon={IconGlyph} size="md" />
          </span>
        </div>

        <div className="ecard-amount">
          <span className="ecard-amount-symbol">{card.currencySymbol}</span>
          <span className="ecard-amount-value">{card.amountText}</span>
        </div>

        <p className="ecard-meta">
          <span>{card.dateText}</span>
          {card.timeText ? (
            <>
              <span className="ecard-meta-sep">·</span>
              <span>{card.timeText}</span>
            </>
          ) : null}
          {card.note ? (
            <>
              <span className="ecard-meta-sep">·</span>
              <span className="line-clamp-1">{card.note}</span>
            </>
          ) : null}
        </p>

        <div className="ecard-scratch">
          <p className="ecard-scratch-reveal">
            {revealed ? card.scratchReveal : null}
          </p>
          <canvas
            ref={canvasRef}
            className={`ecard-scratch-canvas${revealed ? ' is-gone' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden={revealed}
            aria-label={card.scratchHint}
            role="img"
          />
          <span className={`ecard-scratch-label${revealed ? ' is-hidden' : ''}`} aria-hidden="true">
            {card.scratchHint}
          </span>
          {/* 键盘/读屏的等价操作：点一下直接揭开 */}
          {!revealed ? (
            <button
              type="button"
              /**
               * 键盘/读屏的等价操作：Tab 到涂层上按回车直接揭开。
               * pointer-events-none 让**手指手势继续归 canvas**（否则这层按钮会吃掉
               * 刮涂层的 pointermove，表现为"刮不动"）；按钮仍然可聚焦、可回车触发。
               */
              className="pointer-events-none absolute inset-0 z-[2] bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--m-accent)]"
              aria-label={card.scratchHint}
              onClick={finishScratch}
            />
          ) : null}
        </div>

        {card.shareText ? (
          <p className="ecard-aa-line">
            <span className="ecard-aa-chip">AA</span>
            {card.shareText}
          </p>
        ) : null}
      </div>
    </div>
  )
}
