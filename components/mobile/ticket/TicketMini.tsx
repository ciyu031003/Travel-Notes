import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { ticketMoodLabel, ticketThemeClass } from '@/lib/ticket/theme'
import type { TicketData } from '@/lib/ticket/types'
import { TRANSPORT_META } from './ticketBits'

/**
 * 归档网格用的小票卡（约 4:3）
 * ---------------------------------------------------------------------------
 * 只负责"一张缩略票面"：季节天光渐变 + 交通方式徽标 + 三字码 + 日期 + 票号。
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
    <div className={cn('tk-shell tk-mini-shell', themeClass, className)}>
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
          ticket.number
        }
        data-ticket="mini"
        data-ticket-theme={ticket.season + '-' + ticket.dayPart}
      >
        <div className="tk-atmo" aria-hidden="true" />
        <div className="tk-tex" aria-hidden="true" />
        <div className="tk-mini-veil" aria-hidden="true" />

        <div className="tk-body">
          <div className="flex items-start justify-between gap-1">
            <span className="tk-mini-badge">
              <Icon icon={meta.icon} size="sm" />
              {meta.label}
            </span>
            <span className="tk-mini-mood">{ticketMoodLabel(ticket.season, ticket.dayPart)}</span>
          </div>

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
  )
}

export default TicketMini
