'use client'

import FlightTicket from './FlightTicket'
import TrainTicket from './TrainTicket'
import type { TicketData } from '@/lib/ticket/types'

/**
 * 票面分发：按交通方式选用三套票面之一。
 *
 * 机票与火车/高铁票是**两套独立组件**（不是同一个组件换皮）：
 *  · 机票 = 登机牌（深色卡面、三字码、登机口/Boarding）；
 *  · 高铁/火车 = 中国铁路票（站名、车次、车厢座位、检票口），
 *    其中高铁走青绿电子票、普速走米色纸质票（TrainTicket 的 variant）。
 * 这里只做分发，方便完成动画、归档预览、票据夹共用同一入口。
 */
export default function TicketFace({ ticket }: { ticket: TicketData }) {
  if (ticket.transport === 'flight') return <FlightTicket ticket={ticket} />
  return <TrainTicket ticket={ticket} variant={ticket.transport} />
}
