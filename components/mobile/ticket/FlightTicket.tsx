import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { TRANSPORT_ICON } from '@/lib/mobile/icon-system'
import { ticketThemeClass } from '@/lib/ticket/theme'
import type { TicketData } from '@/lib/ticket/types'
import TicketScene from './TicketScene'
import { TicketQr, ticketArtSeed, ticketSceneAlt } from './ticketBits'

/**
 * 机票 / 登机牌票面（纯展示）
 * ---------------------------------------------------------------------------
 * 形态取自真机登机牌：**深色卡面**为主，左边大号三字码 + 虚线航线 +
 * 右侧一条可撕票根（打孔缺口 / 座位 / 二维码）。
 *
 * 视觉语言（本次改版）：票面不再写「春 · 清晨」，季节与天光全部交给
 * <TicketScene> 的分层插画背景（16 套）。插画是背景层：卡面压了一层
 * .tk-scene-scrim 把深墨色铺回来，白字仍然落在低亮度区域上；
 * 票根做成半透明天光窗（季节色透出来），底部的 BOARDING PASS 用
 * mix-blend-mode 的 knockout 贴纸（黑色板 + 白色字 → 文字"挖空"露出插画）。
 *
 * 交互（点击、翻转、归档跳转）一律由父级负责；这里只输出静态票面，
 * 所以既能在 server component 里直接渲染，也能被 TicketReveal / TicketTilt 包裹。
 */

export interface FlightTicketProps {
  /** 票面数据（唯一数据源，票面不写死任何一段旅程） */
  ticket: TicketData
  className?: string
}

export function FlightTicket({ ticket, className }: FlightTicketProps) {
  const themeClass = ticketThemeClass(ticket.season, ticket.dayPart)
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
        <span className="sr-only">{ticketSceneAlt(ticket.season, ticket.dayPart)}</span>
        <div className="tk-skin" aria-hidden="true" />
        <TicketScene season={ticket.season} dayPart={ticket.dayPart} />
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

          {/* 可撕票根：半透明天光窗 + knockout 贴纸 + 座位 + 二维码 */}
          <div className="tk-flight-stub">
            <span className="tk-knock" aria-hidden="true">
              <span>BOARDING</span>
              <span>PASS</span>
            </span>
            <div className="text-center">
              <p className="tk-flight-label">SEAT</p>
              <p className={cn('mt-1', seatClass)}>{ticket.seat}</p>
            </div>
            <span className="tk-flight-qr-plate">
              <TicketQr seed={ticketArtSeed(ticket)} className="tk-flight-qr" />
            </span>
          </div>
        </div>
      </article>
    </div>
  )
}

export default FlightTicket
