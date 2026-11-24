import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { TRANSPORT_ICON } from '@/lib/mobile/icon-system'
import { ticketMoodLabel, ticketThemeClass } from '@/lib/ticket/theme'
import type { TicketData } from '@/lib/ticket/types'
import { TicketQr, ticketArtSeed } from './ticketBits'

/**
 * 机票 / 登机牌票面（纯展示）
 * ---------------------------------------------------------------------------
 * 形态取自真机登机牌：**深色卡面**为主，左边大号三字码 + 虚线航线 +
 * 右侧一条可撕票根（打孔缺口 / 座位 / 二维码 / PULL TO CHECK IN）。
 * 季节与天光只做三件事：卡面右上角的一层天光光晕、票根整条的渐变、
 * 以及季节纹理层——**绝不把整张票铺成"季节壁纸"**。
 *
 * 交互（点击、翻转、归档跳转）一律由父级负责；这里只输出静态票面，
 * 所以既能在 server component 里直接渲染，也能被 TicketReveal 包裹。
 */

export interface FlightTicketProps {
  /** 票面数据（唯一数据源，票面不写死任何一段旅程） */
  ticket: TicketData
  className?: string
}

export function FlightTicket({ ticket, className }: FlightTicketProps) {
  const themeClass = ticketThemeClass(ticket.season, ticket.dayPart)
  const mood = ticketMoodLabel(ticket.season, ticket.dayPart)
  const seatClass = ticket.seat.length > 4 ? 'tk-seat-sm' : 'tk-seat'

  return (
    <div className={cn('tk-shell tk-flight-shell', themeClass, className)}>
      <article
        className={cn('tk tk-flight', themeClass)}
        role="group"
        aria-label={
          '登机牌 ' + ticket.number + ' ' + ticket.from.city + ' 至 ' + ticket.to.city + ' ' + ticket.date
        }
        data-ticket="flight"
        data-ticket-theme={ticket.season + '-' + ticket.dayPart}
      >
        <div className="tk-atmo" aria-hidden="true" />
        <div className="tk-tex" aria-hidden="true" />

        <div className="tk-body">
          {/* 主区 */}
          <div className="tk-flight-main">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tk-flight-kicker">BOARDING PASS</p>
                <p className="tk-flight-number mt-1 truncate">{ticket.number}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tk-flight-date">{ticket.date}</p>
                <p className="tk-flight-mood mt-1">{mood}</p>
              </div>
            </header>

            <div className="tk-flight-route">
              <div className="min-w-0">
                <p className="tk-code">{ticket.from.code}</p>
                <p className="tk-code-city mt-1">{ticket.from.city}</p>
              </div>
              <div className="tk-route">
                <span className="tk-route-line" aria-hidden="true" />
                <Icon icon={TRANSPORT_ICON.PLANE} size="sm" className="tk-route-plane" />
                <span className="tk-route-line" aria-hidden="true" />
              </div>
              <div className="min-w-0 text-right">
                <p className="tk-code">{ticket.to.code}</p>
                <p className="tk-code-city mt-1">{ticket.to.city}</p>
              </div>
            </div>

            <footer className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="tk-flight-label">PASSENGER</p>
                <p className="tk-flight-value mt-1 truncate">{ticket.passenger}</p>
              </div>
              <div className="min-w-0">
                <p className="tk-flight-label">GATE</p>
                <p className="tk-flight-value mt-1">{ticket.gate}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tk-flight-label">BOARDS</p>
                <p className="tk-flight-value mt-1">{ticket.departTime}</p>
              </div>
            </footer>
          </div>

          {/* 可撕票根 */}
          <div className="tk-flight-stub">
            <div className="text-center">
              <p className="tk-flight-label">SEAT</p>
              <p className={cn('mt-1', seatClass)}>{ticket.seat}</p>
            </div>
            <TicketQr seed={ticketArtSeed(ticket)} className="tk-flight-qr" />
            <p className="tk-stub-note">
              PULL TO
              <br />
              CHECK IN
            </p>
          </div>
        </div>
      </article>
    </div>
  )
}

export default FlightTicket
