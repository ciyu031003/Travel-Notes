import { TRANSPORT_ICON } from '@/lib/mobile/icon-system'
import type { TicketTransport } from '@/lib/ticket/types'

/**
 * 交通方式的展示文案/图标
 * ---------------------------------------------------------------------------
 * 只在这里定义一份：吊绳上的吊牌、总览面板、大票浮层都读它，
 * 避免三个地方各写一套「机票 / 高铁 / 火车」。
 * 图标复用 lib/mobile/icon-system 的 TRANSPORT_ICON（值本身就是 lucide 组件，
 * 这里只做映射，不直接 import lucide-react，符合图标门禁）。
 */
export const TRANSPORT_LABEL: Record<TicketTransport, string> = {
  flight: '机票',
  hsr: '高铁票',
  train: '火车票',
}

export const TRANSPORT_SHORT: Record<TicketTransport, string> = {
  flight: '机票',
  hsr: '高铁',
  train: '火车',
}

export const TRANSPORT_ICON_OF = {
  flight: TRANSPORT_ICON.PLANE,
  hsr: TRANSPORT_ICON.TRAIN,
  train: TRANSPORT_ICON.TRAIN,
} as const

/** 机票叫登机口，轨道叫检票口 */
export const GATE_LABEL: Record<TicketTransport, string> = {
  flight: '登机口',
  hsr: '检票口',
  train: '检票口',
}
