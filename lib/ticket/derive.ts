import type {
  TicketData,
  TicketEndpoint,
  TicketDayPart,
  TicketOverride,
  TicketSeason,
  TicketTransport,
} from './types'

/**
 * 票据派生：把一段「已归档旅程」翻译成一张票。
 *
 * 为什么是纯派生而不是建表：票是旅程的**纪念化投影**——旅程信息（标题/地点/日期）
 * 已经是事实来源，另外存一张票会立即产生"旅程改了票不同步"的一致性问题。
 * 用户在票面上改的那几个字段（交通方式、出发/到达、时间、座位）放 localStorage。
 */

/** 常用目的地的三字码（IATA/车站代号）。票面三字码是"视觉锚点"，未收录城市走兜底。 */
const CITY_CODES: Record<string, { code: string; name: string }> = {
  北京: { code: 'PEK', name: '北京' },
  上海: { code: 'SHA', name: '上海' },
  广州: { code: 'CAN', name: '广州' },
  深圳: { code: 'SZX', name: '深圳' },
  成都: { code: 'CTU', name: '成都' },
  重庆: { code: 'CKG', name: '重庆' },
  杭州: { code: 'HGH', name: '杭州' },
  南京: { code: 'NKG', name: '南京' },
  苏州: { code: 'SZV', name: '苏州' },
  武汉: { code: 'WUH', name: '武汉' },
  西安: { code: 'XIY', name: '西安' },
  昆明: { code: 'KMG', name: '昆明' },
  大理: { code: 'DLU', name: '大理' },
  丽江: { code: 'LJG', name: '丽江' },
  香格里拉: { code: 'DIG', name: '香格里拉' },
  西双版纳: { code: 'JHG', name: '西双版纳' },
  厦门: { code: 'XMN', name: '厦门' },
  福州: { code: 'FOC', name: '福州' },
  泉州: { code: 'JJN', name: '泉州' },
  青岛: { code: 'TAO', name: '青岛' },
  济南: { code: 'TNA', name: '济南' },
  烟台: { code: 'YNT', name: '烟台' },
  三亚: { code: 'SYX', name: '三亚' },
  海口: { code: 'HAK', name: '海口' },
  哈尔滨: { code: 'HRB', name: '哈尔滨' },
  长春: { code: 'CGQ', name: '长春' },
  沈阳: { code: 'SHE', name: '沈阳' },
  大连: { code: 'DLC', name: '大连' },
  长沙: { code: 'CSX', name: '长沙' },
  张家界: { code: 'DYG', name: '张家界' },
  郑州: { code: 'CGO', name: '郑州' },
  洛阳: { code: 'LYA', name: '洛阳' },
  贵阳: { code: 'KWE', name: '贵阳' },
  荔波: { code: 'LLB', name: '荔波' },
  南宁: { code: 'NNG', name: '南宁' },
  桂林: { code: 'KWL', name: '桂林' },
  拉萨: { code: 'LXA', name: '拉萨' },
  林芝: { code: 'LZY', name: '林芝' },
  乌鲁木齐: { code: 'URC', name: '乌鲁木齐' },
  喀什: { code: 'KHG', name: '喀什' },
  伊宁: { code: 'YIN', name: '伊宁' },
  西宁: { code: 'XNN', name: '西宁' },
  兰州: { code: 'LHW', name: '兰州' },
  敦煌: { code: 'DNH', name: '敦煌' },
  银川: { code: 'INC', name: '银川' },
  呼和浩特: { code: 'HET', name: '呼和浩特' },
  太原: { code: 'TYN', name: '太原' },
  石家庄: { code: 'SJW', name: '石家庄' },
  天津: { code: 'TSN', name: '天津' },
  南昌: { code: 'KHN', name: '南昌' },
  景德镇: { code: 'JDZ', name: '景德镇' },
  合肥: { code: 'HFE', name: '合肥' },
  黄山: { code: 'TXN', name: '黄山' },
  无锡: { code: 'WUX', name: '无锡' },
  宁波: { code: 'NGB', name: '宁波' },
  舟山: { code: 'HSN', name: '舟山' },
  温州: { code: 'WNZ', name: '温州' },
  扬州: { code: 'YTY', name: '扬州' },
  连云港: { code: 'LYG', name: '连云港' },
  绵阳: { code: 'MIG', name: '绵阳' },
  九寨沟: { code: 'JZH', name: '九寨沟' },
  稻城: { code: 'DCY', name: '稻城' },
  康定: { code: 'KGT', name: '康定' },
  甘孜: { code: 'GZG', name: '甘孜' },
  阿坝: { code: 'AHJ', name: '阿坝' },
  呼伦贝尔: { code: 'HLD', name: '呼伦贝尔' },
  阿尔山: { code: 'YIE', name: '阿尔山' },
  漠河: { code: 'OHE', name: '漠河' },
  延吉: { code: 'YNJ', name: '延吉' },
  珠海: { code: 'ZUH', name: '珠海' },
  澳门: { code: 'MFM', name: '澳门' },
  香港: { code: 'HKG', name: '香港' },
  台北: { code: 'TPE', name: '台北' },
  高雄: { code: 'KHH', name: '高雄' },
}

/** 稳定的字符串哈希（FNV-1a）：同一段旅程每次派生的票面细节都一致 */
function hashOf(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 从「四川 甘孜」这类地点串里取城市名；取不到就退回标题 */
function pickCity(location: string | null | undefined, title: string): string {
  const raw = (location || '').trim()
  if (raw) {
    const parts = raw.split(/[\s\/·,，\-—]+/).filter(Boolean)
    const last = parts[parts.length - 1]
    if (last && last.length <= 12) return last
    return raw.slice(0, 12)
  }
  const cleaned = title.replace(/[「」《》【】]/g, '').trim()
  const head = cleaned.split(/[\s·\-—:：,，]/).filter(Boolean)[0]
  return (head || '远方').slice(0, 12)
}

export function endpointOf(city: string, seed: number): TicketEndpoint {
  const hit = CITY_CODES[city]
  if (hit) return { code: hit.code, city: hit.name }
  // 未收录：给一个稳定的三字码（T + 3 位数字），票面主要靠城市名读信息
  return { code: 'T' + String((seed % 900) + 100), city }
}

/** 交通方式推断：用户显式覆盖 > 标题/地点/标签里的关键词 > 默认机票 */
export function inferTransport(travel: {
  title?: string | null
  location?: string | null
  tags?: unknown
}): TicketTransport {
  const text = [
    travel.title || '',
    travel.location || '',
    Array.isArray(travel.tags) ? travel.tags.join(' ') : String(travel.tags || ''),
  ].join(' ')
  if (/高铁|动车|和谐号|复兴号|G\d{1,4}|D\d{1,4}/.test(text)) return 'hsr'
  if (/火车|绿皮|普速|硬卧|软卧|K\d{1,4}|T\d{1,4}|Z\d{1,4}/.test(text)) return 'train'
  if (/自驾|骑行|徒步|邮轮|轮船/.test(text)) return 'flight' // 暂只出三种票，非轨道/航空按机票纪念
  return 'flight'
}

/** 季节：按出发月份（3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬） */
export function seasonOf(date: Date): TicketSeason {
  const m = date.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

/** 一天四段；出发时间没记录（00:00）时按 stable hash 取一段，保证同票恒定为同一段 */
export function dayPartOf(date: Date, seed: number): TicketDayPart {
  const h = date.getHours()
  const m = date.getMinutes()
  if (h === 0 && m === 0) {
    const order: TicketDayPart[] = ['morning', 'noon', 'dusk', 'evening']
    return order[seed % order.length]
  }
  if (h >= 5 && h < 10) return 'morning'
  if (h >= 10 && h < 16) return 'noon'
  if (h >= 16 && h < 19) return 'dusk'
  return 'evening'
}

const THEMED_HOUR: Record<TicketDayPart, number> = { morning: 7, noon: 12, dusk: 17, evening: 21 }

function pad2(n: number) {
  return n < 10 ? '0' + n : String(n)
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60)
  return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60)
}

const JOURNEY_MINUTES: Record<TicketTransport, number> = { flight: 145, hsr: 260, train: 540 }
const SEAT_ALPHABET = 'ABCDEF'

/** 座位/登机口/票号：全部由 hash 决定（同票永远一致，不用 Math.random） */
function seatOf(transport: TicketTransport, h: number): string {
  if (transport === 'flight') return String((h % 32) + 1) + SEAT_ALPHABET[h % SEAT_ALPHABET.length]
  const coach = String((h % 12) + 1)
  if (transport === 'hsr') return pad2(Number(coach)) + ' 车 ' + pad2((h % 18) + 1) + SEAT_ALPHABET[h % SEAT_ALPHABET.length]
  return pad2(Number(coach)) + ' 车 ' + pad2((h % 60) + 1) + ' 号'
}

function gateOf(transport: TicketTransport, h: number): string {
  if (transport === 'flight') return SEAT_ALPHABET[h % 4] + ((h % 28) + 1)
  return 'A' + ((h % 16) + 1)
}

function numberPrefix(transport: TicketTransport): string {
  return transport === 'flight' ? 'TN' : transport === 'hsr' ? 'G' : 'K'
}

export interface DeriveTicketInput {
  travel: {
    id: number
    slug: string
    title: string
    location?: string | null
    startDate?: string | Date | null
    endDate?: string | Date | null
    tags?: unknown
  }
  passenger: string
  /** 出发城市提示：通常是「上一段旅程的目的地」（旅程链），没有就用默认值 */
  originCity?: string
  override?: TicketOverride
  /** 已归档时间：没有 startDate 时兜底 */
  fallbackDate?: Date
}

export function deriveTicket(input: DeriveTicketInput): TicketData {
  const { travel, passenger, originCity, override } = input
  const seed = hashOf(String(travel.id) + '|' + travel.slug + '|' + travel.title)
  const rawDate = travel.startDate ? new Date(travel.startDate) : input.fallbackDate ?? new Date()
  const validDate = Number.isNaN(rawDate.getTime()) ? new Date() : rawDate

  const transport = override?.transport ?? inferTransport(travel)
  const toCity = override?.toCity || pickCity(travel.location, travel.title)
  const fromCity = override?.fromCity || originCity || '上海'

  const dayPart = override?.dayPart ?? dayPartOf(validDate, seed)
  const departTime = override?.departTime || pad2(THEMED_HOUR[dayPart]) + ':' + pad2((seed % 6) * 7 + 10)
  const arriveTime = addMinutes(departTime, JOURNEY_MINUTES[transport] + (seed % 40))

  const endDate = travel.endDate ? new Date(travel.endDate) : null
  const days =
    endDate && !Number.isNaN(endDate.getTime())
      ? Math.max(1, Math.round((endDate.getTime() - validDate.getTime()) / 86400000) + 1)
      : 1

  const prefix = numberPrefix(transport)
  const number = override?.number || prefix + ' ' + ((seed % 8000) + 1000)
  const priceBase = transport === 'flight' ? 780 : transport === 'hsr' ? 320 : 128
  const price = '¥ ' + (priceBase + (seed % 12) * 40)

  return {
    travelId: travel.id,
    slug: travel.slug,
    transport,
    number,
    from: endpointOf(fromCity, seed),
    to: endpointOf(toCity, seed >> 3),
    date:
      validDate.getFullYear() +
      '.' +
      pad2(validDate.getMonth() + 1) +
      '.' +
      pad2(validDate.getDate()),
    departTime,
    arriveTime,
    seat: override?.seat || seatOf(transport, seed),
    gate: override?.gate || gateOf(transport, seed),
    passenger: passenger || '旅行者',
    price,
    season: seasonOf(validDate),
    dayPart,
    days,
    title: travel.title,
  }
}
