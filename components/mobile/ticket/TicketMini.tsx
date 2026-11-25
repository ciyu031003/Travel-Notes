'use client'

import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { ticketThemeClass } from '@/lib/ticket/theme'
import type { TicketData } from '@/lib/ticket/types'
import TicketScene from './TicketScene'
import TicketTilt from './TicketTilt'
import { TRANSPORT_META, ticketSceneAlt } from './ticketBits'

/**
 * 归档网格用的小票卡（约 4:3）
 * ---------------------------------------------------------------------------
 * 只负责"一张缩略票面"：季节插画天光 + 交通方式徽标 + 三字码 + 日期 + 票号。
 * 小卡上的「春 · 清晨」文字标签已删除（用户要求用背景表达），季节信息改由
 * 插画缩略 + 读屏文本承载，视觉上不再有第二个文字块抢三字码。
 *
 * 支持 3D 悬浮（TicketTilt，kind="mini"）：归档网格里也能跟着指针歪一点，
 * 但触屏拖动只有在横向不被容器（如横向滚动条）接管时才算倾斜手势，
 * 点击/跳转（<Link>）不受影响。
 *
 * **不做跳转**——父级用 <Link> 包住即可（组件里出现 Link 会把展示层和路由绑死，
 * 完成动画 / 归档网格 / 分享图三种场景需要的交互并不一样）。
 */

export interface TicketMiniProps {
  ticket: TicketData
  className?: string
}

export function TicketMini({ ticket, className }: TicketMiniProps) {
  const themeClass = ticketThemeClass(ticket.season, ticket.dayPart)
  const meta = TRANSPORT_META[ticket.transport]
  // 缩略卡上只留 MM.DD，完整日期进 aria-label（避免 11px 字号下挤成两行）
  const shortDate = ticket.date.length >= 10 ? ticket.date.slice(5) : ticket.date

  return (
    <TicketTilt kind="mini" className={className}>
      <div className={cn('tk-shell tk-mini-shell', themeClass)}>
        <article
          className={cn('tk tk-mini', themeClass)}
          role="group"
          aria-label={
            meta.label +
            ' ' +
            ticket.from.city +
            ' 至 ' +
            ticket.to.city +
            ' ' +
            ticket.date +
            ' ' +
            ticket.number +
            ' ' +
            ticketSceneAlt(ticket.season, ticket.dayPart)
          }
          data-ticket="mini"
          data-ticket-theme={ticket.season + '-' + ticket.dayPart}
        >
          <div className="tk-skin" aria-hidden="true" />
          <TicketScene season={ticket.season} dayPart={ticket.dayPart} />
          <div className="tk-atmo" aria-hidden="true" />
          <div className="tk-tex" aria-hidden="true" />
          <div className="tk-mini-veil" aria-hidden="true" />

          <div className="tk-body">
            <span className="tk-mini-badge">
              <Icon icon={meta.icon} size="sm" />
              {meta.label}
            </span>

            <div className="min-w-0">
              <p className="tk-mini-codes">
                <span>{ticket.from.code}</span>
                <span className="tk-mini-arrow" aria-hidden="true">
                  →
                </span>
                <span>{ticket.to.code}</span>
              </p>
              <p className="tk-mini-cities mt-1">
                {ticket.from.city} · {ticket.to.city}
              </p>
            </div>

            <div className="tk-mini-foot">
              <span className="tk-mini-date">{shortDate}</span>
              <span className="tk-mini-number">{ticket.number}</span>
            </div>
          </div>
        </article>
      </div>
    </TicketTilt>
  )
}

export default TicketMini
