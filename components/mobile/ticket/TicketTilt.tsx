'use client'

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * 票据 3D 悬浮（贴纸手感）
 * ============================================================================
 * 参考 jhey 的贴纸 / knockout 做法：卡面是"贴"在页面上的，指针一靠近就轻微
 * 倾过去、并带一枚跟着走的高光（radial-gradient + mix-blend-mode，见 CSS 的
 * .tk-tilt-glare）。松手/移开由 720ms 的过冲曲线 spring 回正。
 *
 * 交互细节（真机与鼠标都照顾）：
 *  · 鼠标：pointerenter/move 直接跟随，perspective + rotateX/rotateY ≤ 7°；
 *  · 触屏：按下先不做任何事；**位移超过 6px** 才判定为"倾斜手势"并捕获指针，
 *    此前一切都是普通点击 —— 6px 以内松手，Link 的跳转/翻页照旧；
 *  · 触屏拖动结束后，浏览器可能补发一个 click（会误触跳转），
 *    所以在捕获阶段吞掉紧跟其后的那一次 click；
 *  · prefers-reduced-motion: 直接不挂手势，CSS 里也不做 transform，
 *    只留静态投影（.tk-tilt-shadow）。
 *
 * 3D 分层：.tk-tilt-inner 建立 preserve-3d 上下文；票面内部的插画层 / 正文层 /
 * 票根层各自 translateZ 不同（见 app/ticket-art.css），倾斜时自然产生视差。
 */

export type TicketTiltKind = 'flight' | 'hsr' | 'train' | 'mini'

/** 最大倾斜角度（需求 ≤8°） */
const MAX_TILT_DEG = 7
/** 触屏位移阈值：小于它算点击，大于它才算倾斜手势 */
const DRAG_THRESHOLD_PX = 6

export interface TicketTiltProps {
  kind: TicketTiltKind
  children: ReactNode
  className?: string
}

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  dragging: boolean
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

export default function TicketTilt({ kind, children, className }: TicketTiltProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const swallowClickRef = useRef(false)
  const reduceMotion = useReducedMotion()

  /** 把指针位置（相对卡片中心）写成 CSS 变量：倾角 + 光斑坐标 */
  const paint = useCallback((clientX: number, clientY: number) => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const nx = clampUnit(((clientX - rect.left) / rect.width) * 2 - 1)
    const ny = clampUnit(((clientY - rect.top) / rect.height) * 2 - 1)
    el.style.setProperty('--tk-tilt-ry', (nx * MAX_TILT_DEG).toFixed(2) + 'deg')
    el.style.setProperty('--tk-tilt-rx', (-ny * MAX_TILT_DEG).toFixed(2) + 'deg')
    el.style.setProperty('--tk-glare-x', (((nx + 1) / 2) * 100).toFixed(1) + '%')
    el.style.setProperty('--tk-glare-y', (((ny + 1) / 2) * 100).toFixed(1) + '%')
  }, [])

  /** 回正：清变量后由 CSS 的 spring 曲线接管 */
  const release = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    el.classList.remove('is-tilting')
    el.style.removeProperty('--tk-tilt-ry')
    el.style.removeProperty('--tk-tilt-rx')
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (reduceMotion) return
      swallowClickRef.current = false
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      }
    },
    [reduceMotion],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (reduceMotion) return
      const el = rootRef.current
      if (!el) return

      // 鼠标走"跟随指针"，不需要按下
      if (event.pointerType === 'mouse') {
        el.classList.add('is-tilting')
        paint(event.clientX, event.clientY)
        return
      }

      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      if (!gesture.dragging) {
        const dx = event.clientX - gesture.startX
        const dy = event.clientY - gesture.startY
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        gesture.dragging = true
        el.classList.add('is-tilting')
        try {
          el.setPointerCapture(event.pointerId)
        } catch {
          /* 某些 WebView 不支持捕获：不影响倾斜 */
        }
      }
      paint(event.clientX, event.clientY)
    },
    [paint, reduceMotion],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (gesture && gesture.dragging && gesture.pointerId === event.pointerId) {
        // 拖过 → 浏览器补发的 click 必须吞掉，否则会顺着 Link/翻页跳走
        swallowClickRef.current = true
      }
      if (event.pointerType !== 'mouse') release()
      gestureRef.current = null
    },
    [release],
  )

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'mouse') return
      release()
    },
    [release],
  )

  /** 捕获阶段拦一次 click：只有"刚刚拖拽过"的那一次会被吞 */
  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClickRef.current) return
    swallowClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return (
    <div
      ref={rootRef}
      className={cn('tk-tilt', className)}
      data-tilt-kind={kind}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onClickCapture={onClickCapture}
    >
      <div className="tk-tilt-inner">
        <span className="tk-tilt-shadow" aria-hidden="true" />
        {children}
        <span className="tk-tilt-glare" aria-hidden="true" />
      </div>
    </div>
  )
}
