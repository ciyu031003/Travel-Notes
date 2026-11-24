import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { TRANSPORT_ICON } from '@/lib/mobile/icon-system'
import { ticketMoodLabel, ticketThemeClass } from '@/lib/ticket/theme'
import type { TicketData } from '@/lib/ticket/types'
import { TicketBarcode, ticketArtSeed, ticketSerial } from './ticketBits'

/**
 * 火车票（同一个文件两个变体：高铁 / 普速纸质票）
 * ---------------------------------------------------------------------------
 * 为什么两个变体放一起：它们是"同一种票的两代形态"，共享 props、共享季节天光、
 * 只换皮。视觉上刻意做成两套语言，一眼可分：
 *
 *   · hsr（高铁）：浅色卡面 + 季节色 × 铁路青绿的**彩色票头**，左侧竖排「高铁」
 *     票根，大号站名 + 车厢座位 + 底部条形码 —— 电子客票 / 现代。
 *   · train（普速）：暖米色**纸**，左缘蓝色流水号竖条、红色车次与检票章、
 *     右侧两道撕口缺口、纸纤维纹理 —— 纸质票 / 旧。
 *
 * 两者都不整卡铺季节壁纸：季节色只出现在票头、流水号竖条、票根与氛围层。
 */

export type TrainTicketVariant = 'hsr' | 'train'

export interface TrainTicketProps {
  /** 票面数据（唯一数据源） */
  ticket: TicketData
  /** 缺省按 ticket.transport 推断：train → 纸质票，其余 → 高铁票 */
  variant?: TrainTicketVariant
  className?: string
}

/* ── 高铁 / 动车票（电子客票） ─────────────────────────────────────────── */
function HsrTicket({ ticket, className }: { ticket: TicketData; className?: string }) {
  const themeClass = ticketThemeClass(ticket.season, ticket.dayPart)

  return (
    <div className={cn('tk-shell tk-hsr-shell', themeClass, className)}>
      <article
        className={cn('tk tk-hsr', themeClass)}
        role="group"
        aria-label={
          '高铁票 ' + ticket.number + ' ' + ticket.from.city + ' 至 ' + ticket.to.city + ' ' + ticket.date
        }
        data-ticket="hsr"
        data-ticket-theme={ticket.season + '-' + ticket.dayPart}
      >
        <div className="tk-atmo" aria-hidden="true" />
        <div className="tk-tex" aria-hidden="true" />

        <div className="tk-body">
          {/* 左侧竖排票根：季节色 × 铁路青绿 */}
          <div className="tk-hsr-stub">
            <span className="tk-hsr-word">高铁</span>
            <span className="tk-hsr-mark">{ticket.days} 天</span>
          </div>

          <div className="tk-hsr-main">
            <header className="tk-hsr-head">
              <div className="min-w-0">
                <p className="tk-hsr-kicker">HIGH-SPEED RAIL · 电子客票</p>
                <p className="tk-hsr-number mt-1 truncate">{ticket.number}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tk-hsr-date">{ticket.date}</p>
                <p className="tk-hsr-mood mt-1">{ticketMoodLabel(ticket.season, ticket.dayPart)}</p>
              </div>
            </header>

            <div className="tk-hsr-route">
              <div className="min-w-0">
                <p className="tk-hsr-station">{ticket.from.city}</p>
                <p className="tk-hsr-code mt-1">{ticket.from.code}</p>
                <p className="tk-hsr-time mt-1">{ticket.departTime}</p>
              </div>
              <div className="tk-hsr-link">
                <span className="tk-hsr-link-line" aria-hidden="true" />
                <Icon icon={TRANSPORT_ICON.TRAIN} size="sm" className="tk-hsr-link-icon" />
                <span className="tk-hsr-link-line" aria-hidden="true" />
              </div>
              <div className="min-w-0 text-right">
                <p className="tk-hsr-station">{ticket.to.city}</p>
                <p className="tk-hsr-code mt-1">{ticket.to.code}</p>
                <p className="tk-hsr-time mt-1">{ticket.arriveTime}</p>
              </div>
            </div>

            <div className="tk-hsr-fields">
              <div className="min-w-0">
                <p className="tk-field-label">车厢座位</p>
                <p className="tk-field-value mt-1 truncate">{ticket.seat}</p>
              </div>
              <div className="min-w-0">
                <p className="tk-field-label">票价</p>
                <p className="tk-field-value mt-1 truncate">{ticket.price}</p>
              </div>
              <div className="min-w-0">
                <p className="tk-field-label">检票口</p>
                <p className="tk-field-value mt-1 truncate">{ticket.gate}</p>
              </div>
            </div>

            <div className="tk-hsr-foot">
              <TicketBarcode seed={ticketArtSeed(ticket)} className="tk-barcode tk-hsr-barcode" />
              <p className="tk-hsr-meta">
                {ticket.passenger} · {ticket.title}
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}

/* ── 普速火车票（纸质票） ──────────────────────────────────────────────── */
function PaperTrainTicket({ ticket, className }: { ticket: TicketData; className?: string }) {
  const themeClass = ticketThemeClass(ticket.season, ticket.dayPart)

  return (
    <div className={cn('tk-shell tk-train-shell', themeClass, className)}>
      <article
        className={cn('tk tk-train', themeClass)}
        role="group"
        aria-label={
          '火车票 ' + ticket.number + ' ' + ticket.from.city + ' 至 ' + ticket.to.city + ' ' + ticket.date
        }
        data-ticket="train"
        data-ticket-theme={ticket.season + '-' + ticket.dayPart}
      >
        <div className="tk-atmo" aria-hidden="true" />
        <div className="tk-tex" aria-hidden="true" />

        <div className="tk-body">
          {/* 左缘蓝色流水号竖条 */}
          <div className="tk-train-serial">
            <span className="tk-train-serial-text">{ticketSerial(ticket)}</span>
          </div>

          <div className="tk-train-main">
            <div className="flex items-start justify-between gap-2">
              <p className="tk-train-kicker">中国铁路 · 纸质车票</p>
              <p className="tk-train-date">{ticket.date}</p>
            </div>

            <div className="tk-train-route">
              <div className="min-w-0">
                <p className="tk-train-station">{ticket.from.city}</p>
                <p className="tk-train-code mt-1">{ticket.from.code}</p>
                <p className="tk-train-time mt-1">{ticket.departTime}</p>
              </div>
              <div className="tk-train-link">
                <span className="tk-train-link-line" aria-hidden="true" />
                <Icon icon={TRANSPORT_ICON.TRAIN} size="sm" className="tk-train-link-icon" />
                <span className="tk-train-link-line" aria-hidden="true" />
              </div>
              <div className="min-w-0 text-right">
                <p className="tk-train-station">{ticket.to.city}</p>
                <p className="tk-train-code mt-1">{ticket.to.code}</p>
                <p className="tk-train-time mt-1">{ticket.arriveTime}</p>
              </div>
            </div>

            <div className="tk-train-fields">
              <div className="min-w-0">
                <p className="tk-field-label">席位</p>
                <p className="tk-field-value mt-1 truncate">{ticket.seat}</p>
              </div>
              <div className="min-w-0">
                <p className="tk-field-label">票价</p>
                <p className="tk-field-value mt-1 truncate">{ticket.price}</p>
              </div>
              <div className="min-w-0">
                <p className="tk-field-label">检票口</p>
                <p className="tk-field-value mt-1 truncate">{ticket.gate}</p>
              </div>
            </div>

            <div className="tk-train-foot">
              <div className="tk-train-number-block">
                <p className="tk-field-label">车次</p>
                <p className="tk-train-number mt-1">{ticket.number}</p>
              </div>
              {/* 红色检票章（装饰，不参与读屏） */}
              <span className="tk-train-stamp" aria-hidden="true">
                检
              </span>
              <TicketBarcode seed={ticketArtSeed(ticket)} className="tk-barcode tk-train-barcode" />
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}

/**
 * 火车票票面：variant 决定形态。
 * 父级只关心"给一段旅程数据"，不必判断 season/dayPart。
 */
export function TrainTicket({ ticket, variant, className }: TrainTicketProps) {
  const resolved: TrainTicketVariant =
    variant ?? (ticket.transport === 'train' ? 'train' : 'hsr')

  if (resolved === 'train') {
    return <PaperTrainTicket ticket={ticket} className={className} />
  }
  return <HsrTicket ticket={ticket} className={className} />
}

export default TrainTicket
