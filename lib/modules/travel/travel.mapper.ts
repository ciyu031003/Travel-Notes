/**
 * Travel 读模型映射：数据库行 → 对外 DTO 的**纯函数**（P2-32 拆分产物）。
 *
 * 抽出的理由：这些函数只做「形状转换 + 字段归一（媒体 URL / 金额 / 日期）」，
 * 不读库、不判可见性。放在 service 里时无法单独测试，且让 service 一半篇幅
 * 是字段搬运。抽走后 service 只剩查询与写入编排，规则/映射可分别演进。
 *
 * 约定（与拆分前逐字节一致，改动会破坏前端契约）：
 *  · 媒体 URL 一律走 storageKeyToUrl / absoluteMediaUrl（**不要手拼 /uploads/**，
 *    否则原生壳页面源是 https://localhost，相对地址会解析到本地壳 → 图片全挂）；
 *  · 金额入库是整数「分」，出口才转「元」；
 *  · 日期一律 Date → ISO 字符串，非法值给 null。
 */
import { centsToYuan } from './money'
import { absoluteMediaUrl, storageKeyToUrl } from '../../media-url'
import type {
  ExpenseRecord,
  TravelDayRecord,
  TravelDayTimelineItem,
  TravelDetail,
  TravelPublicDetail,
  TravelSummary,
} from './travel.types'

/** 解析 tags：新数据是 JSON 数组；历史数据可能是逗号分隔 */
export function safeParseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : null
  } catch {
    // 旧数据可能为逗号分隔
    return raw.split(',').map((v) => v.trim()).filter(Boolean)
  }
}

/** Date（或可被 Date 解析的值） → ISO 字符串；null / 非法日期 → null */
export function iso(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** 预算归一：非有限数或负数一律视为"未设置" */
export function isoBudget(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** 单条 media → 优先缩略图，无变体回退原图（减流量，用于旅行地图左侧照片画廊） */
function thumbUrlOf(m: any): string | null {
  const thumb = m?.variants?.find((v: any) => v.variant === 'THUMBNAIL')
  return storageKeyToUrl(thumb?.storageKey ?? m?.storageKey ?? null)
}

/** 旅行列表项：同时汇总「回忆照片轮播」与「封面（缩略图优先，回退 legacy cover）」 */
export function mapTravelSummary(t: any): TravelSummary {
  // 收集该旅行的回忆照片（去重），用于旅行地图左侧照片轮播
  const seen = new Set<string>()
  const photos: string[] = []
  for (const day of t.days || []) {
    for (const mem of day.memories || []) {
      for (const m of mem.media || []) {
        const url = thumbUrlOf(m)
        if (url && !seen.has(url)) {
          seen.add(url)
          photos.push(url)
        }
      }
    }
  }

  // 封面：优先 coverMedia（缩略图→原图），回退 legacy cover 字段（统一绝对化）
  const coverThumb = t.coverMedia?.variants?.find((v: any) => v.variant === 'THUMBNAIL')?.storageKey
  const coverMediaKey = t.coverMedia?.storageKey
  const coverUrl =
    storageKeyToUrl(coverThumb ?? coverMediaKey ?? null) ?? absoluteMediaUrl(t.cover ?? null)

  return {
    id: t.id,
    title: t.title,
    slug: t.slug,
    description: t.description,
    startDate: iso(t.startDate),
    endDate: iso(t.endDate),
    status: t.status,
    dayCount: t._count.days,
    // 花费合计：整数分求和（无浮点误差），出边界时转回元
    expenseTotal: centsToYuan(
      (t.expenses || []).reduce((s: number, e: { amountCents?: number | null }) => s + (e.amountCents ?? 0), 0),
    ),
    cover: coverUrl ?? t.cover ?? null,
    coverMediaId: t.coverMediaId ?? null,
    photos,
    tags: t.tags ? safeParseTags(t.tags) : null,
    location: t.location ?? null,
    updatedAt: iso(t.updatedAt),
    visibility: t.visibility ?? 'SPACE',
    spaceId: t.spaceId ?? null,
    ownerId: t.ownerId ?? null,
    confirmedAt: iso(t.confirmedAt),
  }
}

/** 旅行列表（批量） */
export function mapTravelList(rows: any[]): TravelSummary[] {
  return rows.map(mapTravelSummary)
}

/** 旅行详情（含天 / 行程项 / 花销） */
export function mapTravelDetail(travel: any): TravelDetail {
  return {
    id: travel.id,
    title: travel.title,
    slug: travel.slug,
    description: travel.description,
    startDate: iso(travel.startDate),
    endDate: iso(travel.endDate),
    status: travel.status,
    days: (travel.days || []).map((d: any): TravelDayRecord => ({
      id: d.id,
      date: iso(d.date),
      title: d.title,
      summary: d.summary,
      sortOrder: d.sortOrder,
      itinerary: (d.itineraryItems || []).map((it: any) => ({
        id: it.id,
        title: it.title,
        startTime: iso(it.startTime),
        endTime: iso(it.endTime),
        type: it.type,
        notes: it.notes,
        locationName: it.location?.name ?? null,
      })),
    })),
    expenses: mapExpenseRecords(travel.expenses || []),
    updatedAt: iso(travel.updatedAt),
    visibility: travel.visibility ?? 'SPACE',
    spaceId: travel.spaceId ?? null,
    ownerId: travel.ownerId ?? null,
  }
}

/** 花销行 → 对外结构（金额「分」→「元」） */
export function mapExpenseRecords(rows: any[]): ExpenseRecord[] {
  return rows.map((e: any) => ({
    id: e.id,
    amount: centsToYuan(e.amountCents),
    currency: e.currency,
    category: e.category,
    payer: e.payer,
    note: e.note,
    happenedAt: iso(e.happenedAt),
    /** 绑定的行程项（null = 未绑定）；前端据此在行程行下展示费用 */
    itineraryItemId: e.itineraryItemId ?? null,
  }))
}

/** 花销 tab：流水 + 合计（合计在整数分上求和，永不丢精度） */
export function mapExpenseList(rows: any[]): { expenses: ExpenseRecord[]; total: number } {
  return {
    expenses: mapExpenseRecords(rows),
    total: centsToYuan(rows.reduce((s: number, e: { amountCents: number }) => s + e.amountCents, 0)),
  }
}

/** 按天叙事时间线的天列表（旅行 → 每天 → 行程 → 回忆 → 照片） */
export function mapTravelTimelineDays(days: any[]): TravelDayTimelineItem[] {
  /** v3.1 M3-D1：照片优先缩略图（减流量），无变体回退原图 */
  const thumbUrl = (m: any) => storageKeyToUrl(m?.variants?.[0]?.storageKey ?? m?.storageKey ?? null)

  return days.map((d: any) => {
    const memories = (d.memories || []).map((mem: any) => {
      const primary = (mem.media || []).map((m: any) => ({ id: m.id, url: thumbUrl(m) }))
      const linked = (mem.mediaLinks || []).map((l: any) => ({ id: l.media.id, url: thumbUrl(l.media) }))
      const seen = new Set<number>()
      const photos = [...primary, ...linked].filter((p: any) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      return {
        id: mem.id,
        title: mem.title,
        content: mem.content ?? null,
        mood: mem.mood ?? null,
        happenedAt: iso(mem.happenedAt),
        photos,
      }
    })
    const seen = new Set<number>()
    const photos = memories
      .flatMap((mem: any) => mem.photos)
      .filter((p: any) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    return {
      id: d.id,
      date: iso(d.date),
      title: d.title,
      summary: d.summary,
      sortOrder: d.sortOrder,
      itinerary: (d.itineraryItems || []).map((it: any) => ({
        id: it.id,
        title: it.title,
        startTime: iso(it.startTime),
        endTime: iso(it.endTime),
        type: it.type,
        notes: it.notes,
        locationName: it.location?.name ?? null,
        expenses: (it.expenses || []).map((e: any) => ({
          id: e.id,
          amount: centsToYuan(e.amountCents),
          currency: e.currency,
          category: e.category,
          payer: e.payer ?? null,
          note: e.note ?? null,
          happenedAt: iso(e.happenedAt),
        })),
      })),
      memories,
      photos,
    } satisfies TravelDayTimelineItem
  })
}

/** 公开旅行详情（Markdown 已由 service 渲染好，这里只做形状转换） */
export function mapTravelPublicDetail(t: any, contentHtml: string): TravelPublicDetail {
  const coverThumb = t.coverMedia?.variants?.find((v: any) => v.variant === 'THUMBNAIL')?.storageKey
  const coverMediaKey = t.coverMedia?.storageKey
  const coverUrl = storageKeyToUrl(coverThumb ?? coverMediaKey ?? null) ?? absoluteMediaUrl(t.cover ?? null)

  return {
    id: t.id,
    title: t.title,
    slug: t.slug,
    description: t.description,
    startDate: iso(t.startDate),
    endDate: iso(t.endDate),
    status: t.status,
    contentHtml,
    tags: t.tags ? safeParseTags(t.tags) : null,
    location: t.location,
    cover: t.cover,
    coverUrl: coverUrl ?? null,
    coverMediaId: t.coverMediaId ?? null,
    travelType: t.travelType ?? 'ALONE',
    companions: t.companions ?? null,
    budget: isoBudget(t.budget),
    confirmedAt: iso(t.confirmedAt),
  }
}
