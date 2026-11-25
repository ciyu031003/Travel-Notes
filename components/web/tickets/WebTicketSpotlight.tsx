'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useFocusTrap, useInertBackground } from '@/hooks/use-focus-trap'
import TicketFace from '@/components/mobile/ticket/TicketFace'
import { travelDetailHref } from '@/lib/routes'
import type { TicketData } from '@/lib/ticket/types'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ArrowUpRightIcon } from './web-ticket-icons'
import { GATE_LABEL, TRANSPORT_LABEL } from './labels'

/**
 * 大票浮层：点吊绳上的任意一张票 → 展开完整票面 + 详情
 * ---------------------------------------------------------------------------
 * 为什么复用 TicketFace：票面是"纪念卡本体"，完成动画 / 移动端归档 / 编辑预览
 * 已经共用同一个入口；Web 只是换了一个更宽松的展台（452px 宽，接近设计宽度），
 * 票面上的三字码 / 时刻 / 座席这时才真正读得清。
 *
 * 交互（桌面键盘优先）：
 *  · Esc 关闭；
 *  · ← / → 在票据之间前后切换（不关闭浮层，像翻一叠票）；
 *  · Tab 被限制在浮层内、背景吊绳置 inert（role=dialog + aria-modal 只负责宣告，
 *    真正的拦截在 hooks/use-focus-trap：舞台浮层与这里共用同一份行为）；
 *  · 打开时锁 body 滚动，关闭后把焦点还给触发它的那张票。
 */
export interface WebTicketSpotlightProps {
  ticket: TicketData
  /** 当前是第几张（从 0 开始，按吊绳的阅读顺序） */
  index: number
  total: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  /** 打开既有「调整票面」面板 */
  onEdit: () => void
}

export default function WebTicketSpotlight({
  ticket,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onEdit,
}: WebTicketSpotlightProps) {
  const plateRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // 无障碍（P1-2）：Tab 圈定在票面浮层内 + 背景（吊绳/画册墙）置 inert。
  // 逻辑与相册 3D 舞台共用 hooks/use-focus-trap，不再各写一份。
  useFocusTrap(plateRef)
  useInertBackground(plateRef)

  // 挂载：记住触发元素 → 锁滚动 → 焦点给关闭键；卸载：全部还原
  useEffect(() => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      restoreRef.current = document.activeElement
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus()
    }
  }, [])

  // 键盘：Esc 关闭 / ← → 翻票（Tab 圈定已抽到 hooks/use-focus-trap）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrev?.()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onNext?.()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, onNext, onPrev])

  const gateLabel = GATE_LABEL[ticket.transport]

  return (
    <div className="wt-spot" role="dialog" aria-modal="true" aria-labelledby="wt-spot-title">
      <button type="button" className="wt-spot-scrim" aria-label="关闭票据详情" tabIndex={-1} onClick={onClose} />

      <div className="wt-spot-plate" ref={plateRef}>
        <button ref={closeRef} type="button" className="wt-spot-close" aria-label="关闭票据详情" onClick={onClose}>
          <CloseIcon />
        </button>

        <div className="wt-spot-ticket">
          <TicketFace ticket={ticket} />
        </div>

        <div className="wt-spot-info">
          <p className="wt-spot-eyebrow">{TRANSPORT_LABEL[ticket.transport]} · 旅程票据</p>
          <h2 className="wt-spot-title" id="wt-spot-title">
            {ticket.title}
          </h2>
          <p className="wt-spot-route">
            <b>{ticket.from.city}</b>
            <span aria-hidden="true">→</span>
            <b>{ticket.to.city}</b>
            <span aria-hidden="true">·</span>
            <span>{ticket.days} 天</span>
          </p>

          <dl className="wt-meta">
            <div>
              <dt>日期</dt>
              <dd>{ticket.date}</dd>
            </div>
            <div>
              <dt>票号</dt>
              <dd>{ticket.number}</dd>
            </div>
            <div>
              <dt>出发</dt>
              <dd>{ticket.departTime}</dd>
            </div>
            <div>
              <dt>到达</dt>
              <dd>{ticket.arriveTime}</dd>
            </div>
            <div>
              <dt>{gateLabel}</dt>
              <dd>{ticket.gate}</dd>
            </div>
            <div>
              <dt>座席</dt>
              <dd>{ticket.seat}</dd>
            </div>
            <div>
              <dt>票价</dt>
              <dd>{ticket.price}</dd>
            </div>
            <div>
              <dt>乘客</dt>
              <dd>{ticket.passenger}</dd>
            </div>
          </dl>

          <div className="wt-spot-actions">
            <Link className="wt-btn wt-btn-primary" href={travelDetailHref(ticket.slug)}>
              查看这段旅程
              <ArrowUpRightIcon />
            </Link>
            <button type="button" className="wt-btn" onClick={onEdit}>
              调整票面
            </button>
          </div>

          <div className="wt-spot-nav">
            <button
              type="button"
              className="wt-spot-nav-btn"
              aria-label="上一张票据"
              onClick={onPrev}
              disabled={!onPrev}
            >
              <ChevronLeftIcon />
            </button>
            <span className="wt-spot-count">
              {index + 1} / {total}
            </span>
            <button
              type="button"
              className="wt-spot-nav-btn"
              aria-label="下一张票据"
              onClick={onNext}
              disabled={!onNext}
            >
              <ChevronRightIcon />
            </button>
          </div>

          <p className="wt-spot-hint">← → 切换票据 · Esc 关闭</p>
        </div>
      </div>
    </div>
  )
}
