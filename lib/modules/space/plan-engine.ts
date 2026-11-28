/**
 * 计划规划引擎（P1a）—— **纯函数、无 IO、无随机、无 Date.now()**。
 *
 * 输入「去哪 / 从哪出发 / 什么时候 / 怎么去 / 怎么玩 / 和谁 / 预算」，
 * 输出确定性的「天 × 块」骨架（与 docs/plan-space-itinerary-engine.md §4.2 规则一一对应）：
 *   R1 天数 = 含首尾日期差（1–30 天，超 30 天只生成前 30 天并标记 truncated）
 *   R2 第 1 天：交通 →（到达早于 12:00 插一个 FLEX 轻松散步）→ 15:00 入住 → 18:30 晚餐
 *   R3 中间天：按节奏 3 / 4 / 6 块，主活动按兴趣轮转注入占位文案
 *   R4 最后一天：早餐 → 11:00 退房 → 14:00 返程（方向反转）
 *   R5 单日：进/出交通 + 1 个活动，避免空天
 *   R6 预算分配：交通 35% / 住宿 30% / 餐饮 20% / 门票活动 15%（软目标，不强制）
 *   R7 时间默认值：早 08:30 / 午 12:00 / 晚 18:30（块时间不自动重排，UI 另有「按时间排序」）
 *   R8 engineVersion = 1，只在生成时写入；不静默覆盖用户已填内容（重新生成由服务层控制）
 *
 * 时间约定：startAt/endAt 是**墙上时间**字符串 'YYYY-MM-DDTHH:mm'（不带时区），
 * 服务层用 Date.UTC(...) 落库、用 getUTC* 读回 —— 与 Travel ItineraryItem 的历史约定一致
 * （见 tests/unit/travel-itinerary-time-tz.test.ts）。
 *
 * 可测试性：服务端「创建计划 / 重新生成」与前端预览调用同一个函数，保证同构一致。
 */

export type PlanTransportMode = 'FLIGHT' | 'TRAIN' | 'DRIVE' | 'MIXED'
export type PlanPace = 'RELAXED' | 'STANDARD' | 'PACKED'
export type PlanItemKind = 'TRANSPORT' | 'HOTEL' | 'FOOD' | 'SPOT' | 'ACTIVITY' | 'FLEX'
export type PlanInterest = '美食' | '自然' | '人文' | '购物' | '亲子' | '夜生活'

export const PLAN_TRANSPORT_MODES: PlanTransportMode[] = ['FLIGHT', 'TRAIN', 'DRIVE', 'MIXED']
export const PLAN_PACES: PlanPace[] = ['RELAXED', 'STANDARD', 'PACKED']
export const PLAN_INTERESTS: PlanInterest[] = ['美食', '自然', '人文', '购物', '亲子', '夜生活']

/** 引擎版本：写入 planMeta.engineVersion；结构性变更时才 +1 */
export const ENGINE_VERSION = 1
/** 单次最多生成的天数（超出只生成前 30 天 + 提示） */
export const MAX_ENGINE_DAYS = 30

export interface PlanEngineInput {
  destination: string
  departureCity?: string | null
  /** 'YYYY-MM-DD'（允许带时间，取前 10 位） */
  startDate: string
  endDate: string
  transportMode?: string | null
  pace?: string | null
  interests?: string[] | null
  /** 同行者 username 列表（仅记录，不参与骨架规则） */
  travelers?: string[] | null
  /** 预算（人民币元）；null/0 = 不分配 */
  budget?: number | null
}

export interface PlanEngineItem {
  kind: PlanItemKind
  /** 'YYYY-MM-DDTHH:mm' 墙上时间；null = 待定 */
  startAt: string | null
  endAt: string | null
  title: string
  place: string | null
  /** 金额用分；null = 未填 */
  costCents: number | null
  note: string | null
  sortOrder: number
}

export interface PlanEngineDay {
  /** 'YYYY-MM-DD' */
  date: string
  title: string
  theme: string | null
  summary: string | null
  /** 1-based，与日期顺序一致 */
  sortOrder: number
  items: PlanEngineItem[]
}

export interface PlanBudgetSplit {
  /** 交通 */
  transport: number
  /** 住宿 */
  hotel: number
  /** 餐饮 */
  food: number
  /** 门票/活动 */
  ticket: number
}

export interface PlanEngineItinerary {
  engineVersion: typeof ENGINE_VERSION
  dayCount: number
  /** 请求天数 > 30 时为 true（只生成了前 30 天） */
  truncated: boolean
  /** 请求的天数（含首尾）；truncated 时有意义 */
  requestedDayCount: number
  days: PlanEngineDay[]
  /** 预算软目标（元，两位小数）；无预算时为 null */
  budgetSplit: PlanBudgetSplit | null
}

// ============================================================
// 交通方式 → 默认时刻与文案
// ============================================================

interface TransportProfile {
  /** 默认出发时刻 HH:mm */
  depart: string
  /** 到达时刻 HH:mm（用于判断「到达早于 12:00」与返程时刻） */
  arrive: string
  /** 单程时长（分钟），用于返程 endAt */
  minutes: number
  /** 中文方式标签 */
  label: string
  /** 出发提示 */
  note: string
}

const TRANSPORT_PROFILES: Record<PlanTransportMode, TransportProfile> = {
  // 航班 09:00 起飞、11:20 抵达 —— 唯一「到达早于 12:00」的方式，会触发 R2 的 FLEX 散步块
  FLIGHT: { depart: '09:00', arrive: '11:20', minutes: 140, label: '航班', note: '航班号待定；提前 90 分钟到机场，留意行李额度' },
  TRAIN: { depart: '09:00', arrive: '12:20', minutes: 200, label: '高铁', note: '车次待定；提前 40 分钟到站，预留安检时间' },
  DRIVE: { depart: '08:00', arrive: '13:00', minutes: 300, label: '自驾', note: '自驾路线待定；每 2 小时进服务区休息' },
  MIXED: { depart: '08:30', arrive: '12:30', minutes: 240, label: '高铁 + 当地交通', note: '大交通车次 + 当地交通待定；预留换乘时间' },
}

function transportProfile(mode: PlanTransportMode | null | undefined): TransportProfile {
  return TRANSPORT_PROFILES[mode && mode in TRANSPORT_PROFILES ? mode : 'TRAIN']
}

// ============================================================
// 兴趣 → 占位文案与主题（R3 兴趣注入）
// ============================================================

interface InterestProfile {
  /** 主活动标题占位 */
  mainTitle: string
  /** 主活动类型 */
  mainKind: PlanItemKind
  /** 当天主题（天标题） */
  theme: string
}

const INTEREST_PROFILES: Record<PlanInterest, InterestProfile> = {
  美食: { mainTitle: '本地人推荐的小馆', mainKind: 'FOOD', theme: '吃到当地' },
  自然: { mainTitle: '近郊徒步 / 湖边', mainKind: 'SPOT', theme: '自然慢走' },
  人文: { mainTitle: '博物馆 / 老街', mainKind: 'SPOT', theme: '人文漫游' },
  购物: { mainTitle: '本地市集 / 商圈逛逛', mainKind: 'SPOT', theme: '逛街淘物' },
  亲子: { mainTitle: '亲子友好景点', mainKind: 'SPOT', theme: '亲子时光' },
  夜生活: { mainTitle: '夜市 / 小酒馆', mainKind: 'ACTIVITY', theme: '夜色光顾' },
}

const DEFAULT_THEME = '自由安排'
const DEFAULT_MAIN = { mainTitle: '挑一个最想去的地方', mainKind: 'SPOT' as PlanItemKind }

// ============================================================
// 日期工具（纯字符串 + Date.UTC，不依赖运行环境时区）
// ============================================================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function parseYmd(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null
  // 反查校验（拒绝 2026-02-30 这类）
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null
  return { y, m, d }
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function addDays(ymd: { y: number; m: number; d: number }, delta: number): { y: number; m: number; d: number } {
  const base = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + delta))
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate() }
}

function dayDiff(from: { y: number; m: number; d: number }, to: { y: number; m: number; d: number }): number {
  const a = Date.UTC(from.y, from.m - 1, from.d)
  const b = Date.UTC(to.y, to.m - 1, to.d)
  return Math.round((b - a) / 86_400_000)
}

/** 'HH:mm' + 分钟 → 'HH:mm'（跨天则取 23:59，避免出现「25:10」） */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59)
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

function at(dateYmd: string, time: string): string {
  return `${dateYmd}T${time}`
}

/** 把一天内的多个块按时间排序后重排 sortOrder（引擎内部保证输出稳定） */
function finalizeDay(day: PlanEngineDay): PlanEngineDay {
  const items = day.items
    .map((item, index) => ({ ...item, sortOrder: index }))
    .sort((a, b) => {
      const ta = a.startAt ?? '99'
      const tb = b.startAt ?? '99'
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })
  return { ...day, items: items.map((item, index) => ({ ...item, sortOrder: index })) }
}

function item(partial: Omit<PlanEngineItem, 'sortOrder'>): PlanEngineItem {
  return { ...partial, sortOrder: 0 }
}

// ============================================================
// 预算分配（R6）
// ============================================================

const BUDGET_RATIOS = { transport: 0.35, hotel: 0.3, food: 0.2, ticket: 0.15 } as const

function splitBudget(budget: number | null | undefined): PlanBudgetSplit | null {
  if (budget == null) return null
  const total = Number(budget)
  if (!Number.isFinite(total) || total <= 0) return null
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    transport: round2(total * BUDGET_RATIOS.transport),
    hotel: round2(total * BUDGET_RATIOS.hotel),
    food: round2(total * BUDGET_RATIOS.food),
    ticket: round2(total * BUDGET_RATIOS.ticket),
  }
}

// ============================================================
// 块构造
// ============================================================

interface BlockSpec {
  kind: PlanItemKind
  start: string
  end: string
  title: string
  place?: string | null
  costCents?: number | null
  note?: string | null
}

function block(dateYmd: string, spec: BlockSpec): PlanEngineItem {
  return item({
    kind: spec.kind,
    startAt: at(dateYmd, spec.start),
    endAt: at(dateYmd, spec.end),
    title: spec.title,
    place: spec.place ?? null,
    costCents: spec.costCents ?? null,
    note: spec.note ?? null,
  })
}

function fromLabel(departureCity: string | null | undefined): string {
  const value = typeof departureCity === 'string' ? departureCity.trim() : ''
  return value || '待定出发地'
}

function toLabel(destination: string): string {
  return destination.trim() || '目的地'
}

/** 单程交通块（出发/返程共用） */
function transportBlock(
  dateYmd: string,
  from: string,
  to: string,
  profile: TransportProfile,
  options: { depart?: string; returnTrip?: boolean },
): PlanEngineItem {
  const depart = options.depart ?? profile.depart
  const arrive = addMinutes(depart, profile.minutes)
  return block(dateYmd, {
    kind: 'TRANSPORT',
    start: depart,
    end: arrive === depart ? profile.arrive : arrive,
    title: `${from} → ${to}（${profile.label}）`,
    place: `${from} → ${to}`,
    note: options.returnTrip
      ? `${profile.note}；返程票待定，提前 1 小时出发去站/机场`
      : profile.note,
  })
}

/** 第 1 天：交通 →（可选 FLEX）→ 入住 → 晚餐（R2） */
function buildFirstDay(dateYmd: string, from: string, to: string, profile: TransportProfile): PlanEngineDay {
  const items: PlanEngineItem[] = [transportBlock(dateYmd, from, to, profile, {})]
  // 到达早于 12:00 → 插入一个轻松散步的 FLEX（航班默认 11:20 抵达会命中）
  if (profile.arrive < '12:00') {
    items.push(block(dateYmd, {
      kind: 'FLEX',
      start: '11:30',
      end: '12:00',
      title: '到了先散散步',
      place: `${to}（酒店附近）`,
      note: '行程宽松：先适应一下，顺便看看周边有什么吃的',
    }))
  }
  items.push(block(dateYmd, {
    kind: 'HOTEL',
    start: '15:00',
    end: '15:40',
    title: `入住 ${to} 酒店`,
    place: `${to}（酒店位置待定）`,
    note: '优先选交通方便、可寄存行李的酒店',
  }))
  items.push(block(dateYmd, {
    kind: 'FOOD',
    start: '18:30',
    end: '20:00',
    title: '找一家本地菜',
    place: `${to}（本地菜馆待定）`,
    note: '引擎占位：填店名与人均，转换旅行记录时会带上',
  }))
  return finalizeDay({
    date: dateYmd,
    title: `抵达${to}`,
    theme: '第一晚',
    summary: `${from}出发，预计午后抵达${to}，先安顿下来再出门觅食。`,
    sortOrder: 1,
    items,
  })
}

/** 中间天：按节奏出 3 / 4 / 6 块，主活动按兴趣轮转（R3） */
function buildMiddleDay(
  dateYmd: string,
  dayIndex: number,
  destination: string,
  pace: PlanPace,
  interests: PlanInterest[],
): PlanEngineDay {
  const interest = interests.length > 0 ? interests[(dayIndex - 2) % interests.length] : null
  const profile = interest ? INTEREST_PROFILES[interest] : null
  const mainTitle = profile?.mainTitle ?? DEFAULT_MAIN.mainTitle
  const mainKind: PlanItemKind = profile?.mainKind ?? DEFAULT_MAIN.mainKind
  const theme = profile?.theme ?? DEFAULT_THEME
  const place = `${destination}（具体待定）`

  const items: PlanEngineItem[] = []
  items.push(block(dateYmd, {
    kind: 'FOOD',
    start: '08:30',
    end: '09:15',
    title: '酒店早餐 / 街边早点',
    place,
    note: '引擎占位：填店名即可',
  }))

  if (pace === 'RELAXED') {
    // 3 块：早 / 主活动 / 晚 —— 一天只安排一件正事
    items.push(block(dateYmd, {
      kind: mainKind,
      start: '10:30',
      end: '14:00',
      title: mainTitle,
      place,
      note: '引擎占位：按兴趣推荐，可替换成自己想去的点',
    }))
    items.push(block(dateYmd, {
      kind: 'FOOD',
      start: '18:30',
      end: '20:00',
      title: '晚餐',
      place,
      note: null,
    }))
  } else if (pace === 'PACKED') {
    // 6 块：早 / 上午主活动 / 午餐 / 下午活动 / 晚餐 / 夜生活
    items.push(block(dateYmd, {
      kind: mainKind,
      start: '09:30',
      end: '12:00',
      title: mainTitle,
      place,
      note: '引擎占位：按兴趣推荐，可替换成自己想去的点',
    }))
    items.push(block(dateYmd, {
      kind: 'FOOD',
      start: '12:30',
      end: '13:30',
      title: '午餐',
      place,
      note: null,
    }))
    items.push(block(dateYmd, {
      kind: 'ACTIVITY',
      start: '14:30',
      end: '17:00',
      title: '下午：茶馆 / 手作 / 骑行',
      place,
      note: '节奏偏紧：下午再安排一场，按体力取舍',
    }))
    items.push(block(dateYmd, {
      kind: 'FOOD',
      start: '18:30',
      end: '20:00',
      title: '晚餐',
      place,
      note: null,
    }))
    items.push(block(dateYmd, {
      kind: 'ACTIVITY',
      start: '21:00',
      end: '22:30',
      title: '夜生活：夜市 / 小酒馆',
      place,
      note: '机动块：累了就跳过',
    }))
  } else {
    // STANDARD（默认）4 块：早 / 上午主活动 / 下午活动 / 晚
    items.push(block(dateYmd, {
      kind: mainKind,
      start: '10:00',
      end: '12:00',
      title: mainTitle,
      place,
      note: '引擎占位：按兴趣推荐，可替换成自己想去的点',
    }))
    items.push(block(dateYmd, {
      kind: 'ACTIVITY',
      start: '15:00',
      end: '17:30',
      title: '下午：茶馆 / 手作 / 骑行',
      place,
      note: '引擎占位：填具体安排',
    }))
    items.push(block(dateYmd, {
      kind: 'FOOD',
      start: '18:30',
      end: '20:00',
      title: '晚餐',
      place,
      note: null,
    }))
  }

  const paceLabel = pace === 'RELAXED' ? '轻松' : pace === 'PACKED' ? '紧凑' : '标准'
  return finalizeDay({
    date: dateYmd,
    title: theme,
    theme,
    summary: `${paceLabel}节奏，${items.length} 个安排；主活动：${mainTitle}。`,
    sortOrder: dayIndex,
    items,
  })
}

/** 最后一天：早餐 → 退房 → 返程（R4） */
function buildLastDay(
  dateYmd: string,
  dayIndex: number,
  from: string,
  to: string,
  profile: TransportProfile,
): PlanEngineDay {
  const items: PlanEngineItem[] = [
    block(dateYmd, {
      kind: 'FOOD',
      start: '08:30',
      end: '09:15',
      title: '酒店早餐 / 街边早点',
      place: `${to}（酒店附近）`,
      note: null,
    }),
    block(dateYmd, {
      kind: 'HOTEL',
      start: '11:00',
      end: '11:30',
      title: '退房（行李可寄存前台）',
      place: `${to}（酒店）`,
      note: '退房后行李寄存，再逛一会儿',
    }),
    transportBlock(dateYmd, to, from, profile, { depart: '14:00', returnTrip: true }),
  ]
  return finalizeDay({
    date: dateYmd,
    title: '返程',
    theme: '返程',
    summary: `收拾行李退房，14:00 出发返程回${from}。`,
    sortOrder: dayIndex,
    items,
  })
}

/** 单日行程：进/出交通 + 1 个活动（R5，避免生成空天） */
function buildSingleDay(dateYmd: string, from: string, to: string, profile: TransportProfile): PlanEngineDay {
  const outbound = transportBlock(dateYmd, from, to, profile, {})
  const arrive = outbound.endAt?.slice(11) ?? profile.arrive
  // 活动从抵达后 30 分钟开始，至少 1 小时；返程 16:30
  const activityStart = addMinutes(arrive > '07:00' ? arrive : '12:00', 30)
  const items: PlanEngineItem[] = [
    outbound,
    block(dateYmd, {
      kind: 'ACTIVITY',
      start: activityStart,
      end: addMinutes(activityStart, 90),
      title: '单日往返：只安排一个核心活动',
      place: `${to}（具体待定）`,
      note: '当天往返，留出返程时间，别排太满',
    }),
    transportBlock(dateYmd, to, from, profile, { depart: '16:30', returnTrip: true }),
  ]
  return finalizeDay({
    date: dateYmd,
    title: `${to}一日往返`,
    theme: '一日往返',
    summary: `当天往返：${from} → ${to} → ${from}，中间只安排一个核心活动。`,
    sortOrder: 1,
    items,
  })
}

// ============================================================
// 主入口
// ============================================================

function normalizeMode(value: string | null | undefined): PlanTransportMode {
  return value && (PLAN_TRANSPORT_MODES as string[]).includes(value) ? (value as PlanTransportMode) : 'TRAIN'
}

function normalizePace(value: string | null | undefined): PlanPace {
  return value && (PLAN_PACES as string[]).includes(value) ? (value as PlanPace) : 'STANDARD'
}

/** 兴趣归一化：只保留白名单内的值（去重、保持输入顺序） */
export function normalizeInterests(input: string[] | null | undefined): PlanInterest[] {
  if (!input || !Array.isArray(input)) return []
  const out: PlanInterest[] = []
  for (const raw of input) {
    const value = String(raw ?? '').trim()
    if ((PLAN_INTERESTS as string[]).includes(value) && !out.includes(value as PlanInterest)) {
      out.push(value as PlanInterest)
    }
  }
  return out
}

/**
 * 生成行程骨架（确定性：同一输入永远得到同一输出）。
 *
 * 校验失败抛 Error（中文提示，服务层转 400）。日期必须是 'YYYY-MM-DD'（允许带时间，取日期部分）。
 */
export function buildItinerary(input: PlanEngineInput): PlanEngineItinerary {
  const destination = String(input.destination ?? '').trim()
  if (!destination) throw new Error('目的地不能为空')

  const start = parseYmd(input.startDate)
  const end = parseYmd(input.endDate)
  if (!start) throw new Error('开始日期格式不正确')
  if (!end) throw new Error('结束日期格式不正确')
  const diff = dayDiff(start, end)
  if (diff < 0) throw new Error('结束日期不能早于开始日期')

  const requestedDayCount = diff + 1
  const dayCount = Math.min(requestedDayCount, MAX_ENGINE_DAYS)
  const truncated = requestedDayCount > MAX_ENGINE_DAYS

  const mode = normalizeMode(input.transportMode)
  const pace = normalizePace(input.pace)
  const interests = normalizeInterests(input.interests)
  const profile = transportProfile(mode)
  const from = fromLabel(input.departureCity)
  const to = toLabel(destination)

  const days: PlanEngineDay[] = []
  if (dayCount === 1) {
    days.push(buildSingleDay(formatYmd(start.y, start.m, start.d), from, to, profile))
  } else {
    days.push(buildFirstDay(formatYmd(start.y, start.m, start.d), from, to, profile))
    for (let index = 2; index <= dayCount - 1; index += 1) {
      const date = addDays(start, index - 1)
      days.push(buildMiddleDay(formatYmd(date.y, date.m, date.d), index, to, pace, interests))
    }
    const lastDate = addDays(start, dayCount - 1)
    days.push(buildLastDay(formatYmd(lastDate.y, lastDate.m, lastDate.d), dayCount, from, to, profile))
  }

  return {
    engineVersion: ENGINE_VERSION,
    dayCount,
    truncated,
    requestedDayCount,
    days,
    budgetSplit: splitBudget(input.budget),
  }
}

// ============================================================
// Yjs 文档初始结构（P1b 转成 Y.Doc 用；这里只给 plain JSON）
// ============================================================

export interface YjsSeedDay {
  id: string
  date: string | null
  title: string | null
  theme: string | null
  summary: string | null
  /** 该天块的 id 顺序（与 items 的 key 对应） */
  itemIds: string[]
}

export interface YjsSeedItem {
  id: string
  dayId: string
  kind: PlanItemKind
  startAt: string | null
  endAt: string | null
  title: string
  place: string | null
  costCents: number | null
  note: string | null
  done: boolean
  doneBy: string | null
  sortOrder: number
  mediaIds: number[]
}

export interface YjsSeedMeta {
  departureCity: string | null
  transportMode: PlanTransportMode
  pace: PlanPace
  interests: PlanInterest[]
  budgetSplit: PlanBudgetSplit | null
  engineVersion: number
}

export interface YjsSeed {
  version: 1
  /** Y.Array<Y.Map>：顺序即展示顺序 */
  days: YjsSeedDay[]
  /** Y.Map<Y.Map>：key = itemId */
  items: Record<string, YjsSeedItem>
  /** Y.Map */
  meta: YjsSeedMeta
}

/**
 * 引擎输出 → Yjs 文档初始结构（plain JSON）。
 *
 * 与 docs/plan-p1-collab-spec.md §2 的文档结构一一对应：
 *   days 是数组（顺序即展示顺序）、items 是以 itemId 为 key 的映射、meta 是计划级输入。
 * id 用确定性字符串（d1 / d1i1），让「同一份骨架重复初始化」是幂等的；
 * P1b 把这份 JSON 灌进 Y.Doc（title/note/place 用 Y.Text，其余普通值）。
 */
export function buildYjsSeed(
  itinerary: PlanEngineItinerary,
  input?: Pick<PlanEngineInput, 'departureCity' | 'transportMode' | 'pace' | 'interests'>,
): YjsSeed {
  const days: YjsSeedDay[] = []
  const items: Record<string, YjsSeedItem> = {}

  itinerary.days.forEach((day, dayIndex) => {
    const dayId = `d${dayIndex + 1}`
    const itemIds: string[] = []
    day.items.forEach((entry, itemIndex) => {
      const itemId = `${dayId}i${itemIndex + 1}`
      itemIds.push(itemId)
      items[itemId] = {
        id: itemId,
        dayId,
        kind: entry.kind,
        startAt: entry.startAt,
        endAt: entry.endAt,
        title: entry.title,
        place: entry.place,
        costCents: entry.costCents,
        note: entry.note,
        done: false,
        doneBy: null,
        sortOrder: entry.sortOrder,
        mediaIds: [],
      }
    })
    days.push({
      id: dayId,
      date: day.date,
      title: day.title,
      theme: day.theme,
      summary: day.summary,
      itemIds,
    })
  })

  return {
    version: 1,
    days,
    items,
    meta: {
      departureCity: input?.departureCity?.trim() || null,
      transportMode: normalizeMode(input?.transportMode),
      pace: normalizePace(input?.pace),
      interests: normalizeInterests(input?.interests),
      budgetSplit: itinerary.budgetSplit,
      engineVersion: itinerary.engineVersion,
    },
  }
}
