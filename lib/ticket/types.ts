/**
 * 旅程票据（机票 / 高铁票 / 火车票）数据契约
 * ---------------------------------------------------------------------------
 * 票据不是独立业务实体：**每段已归档旅程自动派生一张票**。
 * 派生结果（`TicketData`）是纯展示数据，用户可覆盖的少数字段（交通方式/出发到达/
 * 时间/座位）存放在 localStorage（lib/ticket/store.ts），避免为此改数据库。
 */

export type TicketTransport = 'flight' | 'hsr' | 'train'

export type TicketSeason = 'spring' | 'summer' | 'autumn' | 'winter'

/** 一天四段：清晨 / 正午 / 黄昏 / 夜晚（决定票据的天光配色） */
export type TicketDayPart = 'morning' | 'noon' | 'dusk' | 'evening'

export interface TicketEndpoint {
  /** 三字码（机场 IATA / 车站代号），用于票面大字号展示 */
  code: string
  /** 城市名（如「大理」） */
  city: string
}

export interface TicketData {
  travelId: number
  slug: string
  transport: TicketTransport
  /** 票号：航班号 CA 204 / 车次 G 1372 / K 1024 */
  number: string
  from: TicketEndpoint
  to: TicketEndpoint
  /** YYYY.MM.DD */
  date: string
  /** 出发时刻 HH:mm */
  departTime: string
  /** 到达时刻 HH:mm */
  arriveTime: string
  /** 座位：14A / 06 车 12F / 08 车 045 号 */
  seat: string
  /** 登机口 / 检票口：B12 / A3 */
  gate: string
  passenger: string
  /** 票价（人民币，仅展示；火车/高铁票面上有） */
  price: string
  season: TicketSeason
  dayPart: TicketDayPart
  /** 天数（旅程跨度），票面小字「3 天」 */
  days: number
  /** 旅程标题（票面小字/归档用） */
  title: string
}

/** 用户可覆盖的字段（localStorage 持久化，见 store.ts） */
export interface TicketOverride {
  transport?: TicketTransport
  fromCity?: string
  toCity?: string
  /** HH:mm；留空则沿用派生值 */
  departTime?: string
  dayPart?: TicketDayPart
  seat?: string
  gate?: string
  number?: string
}
