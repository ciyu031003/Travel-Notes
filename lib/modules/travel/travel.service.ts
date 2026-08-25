/**
 * Travel 规划：管理新数据模型下的旅行 → 天数 → 行程项 → 花费。
 * （面向 P2 的行程与花费管理；公开的旅行详情展示属于 P5）
 */
import { prisma } from '../../db'
import { scopedWhere } from '../../visibility'
import { syncTravelPost, unpublishTravelPost } from '../social/travel-post.service'
import { unifiedMarkdownRenderer } from '../../infrastructure/markdown'
import { skipDbOnBuild } from '../../db-guard'

export interface TravelSummary {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  dayCount: number
  expenseTotal: number
  cover: string | null
  tags: string[] | null
  location: string | null
  updatedAt: string | null
  visibility: string
  spaceId: number | null
  ownerId: number | null
}

export interface ItineraryItemRecord {
  id: number
  title: string
  startTime: string | null
  endTime: string | null
  type: string
  notes: string | null
  locationName: string | null
}

export interface TravelDayRecord {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: ItineraryItemRecord[]
}

export interface ExpenseRecord {
  id: number
  amount: number
  currency: string
  category: string
  payer: string | null
  note: string | null
  happenedAt: string | null
}

export interface TravelDetail {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  days: TravelDayRecord[]
  expenses: ExpenseRecord[]
  updatedAt: string | null
  visibility: string
  spaceId: number | null
  ownerId: number | null
}

function safeParseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : null
  } catch {
    // 旧数据可能为逗号分隔
    return raw.split(',').map((v) => v.trim()).filter(Boolean)
  }
}

function iso(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export async function listTravels(userId?: number | null): Promise<TravelSummary[]> {
  if (skipDbOnBuild()) return []
  const rows = await prisma.travel.findMany({
    where: scopedWhere(userId, 'ownerId') as any,
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { days: true } },
      expenses: true,
    },
  })
  return rows.map((t: any) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    description: t.description,
    startDate: iso(t.startDate),
    endDate: iso(t.endDate),
    status: t.status,
    dayCount: t._count.days,
    expenseTotal: t.expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0),
    cover: t.cover ?? null,
    tags: t.tags ? safeParseTags(t.tags) : null,
    location: t.location ?? null,
    updatedAt: iso(t.updatedAt),
    visibility: t.visibility ?? 'SPACE',
    spaceId: t.spaceId ?? null,
    ownerId: t.ownerId ?? null,
  }))
}

export async function getTravelDetail(id: number, userId?: number | null): Promise<TravelDetail | null> {
  const travel = await prisma.travel.findFirst({
    where: { ...scopedWhere(userId, 'ownerId'), id } as any,
    include: {
      days: {
        orderBy: { sortOrder: 'asc' },
        include: {
          itineraryItems: {
            orderBy: { sortOrder: 'asc' },
            include: { location: { select: { name: true } } },
          },
        },
      },
      expenses: { orderBy: { happenedAt: 'asc' } },
    },
  })
  if (!travel) return null
  return {
    id: travel.id,
    title: travel.title,
    slug: travel.slug,
    description: travel.description,
    startDate: iso(travel.startDate),
    endDate: iso(travel.endDate),
    status: travel.status,
    days: travel.days.map((d: any) => ({
      id: d.id,
      date: iso(d.date),
      title: d.title,
      summary: d.summary,
      sortOrder: d.sortOrder,
      itinerary: d.itineraryItems.map((it: any) => ({
        id: it.id,
        title: it.title,
        startTime: iso(it.startTime),
        endTime: iso(it.endTime),
        type: it.type,
        notes: it.notes,
        locationName: it.location?.name ?? null,
      })),
    })),
    expenses: travel.expenses.map((e: any) => ({
      id: e.id,
      amount: e.amount,
      currency: e.currency,
      category: e.category,
      payer: e.payer,
      note: e.note,
      happenedAt: iso(e.happenedAt),
    })),
    updatedAt: iso(travel.updatedAt),
    visibility: travel.visibility ?? 'SPACE',
    spaceId: travel.spaceId ?? null,
    ownerId: travel.ownerId ?? null,
  }
}


export interface TravelDayTimelineItem {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: { id: number; title: string; startTime: string | null; endTime: string | null; type: string; notes: string | null; locationName: string | null }[]
  /** 当天的回忆（含其照片） */
  memories: {
    id: number
    title: string
    content: string | null
    mood: string | null
    happenedAt: string | null
    photos: { id: number; url: string }[]
  }[]
  /** 当天照片（由当天回忆的照片去重汇总，v3.1 M1-A4） */
  photos: { id: number; url: string }[]
}

/** v3.1 M1-A4：按天叙事时间线（旅行 → 每一天 → 行程 → 回忆 → 照片） */
export async function getTravelTimeline(id: number, userId?: number | null): Promise<{ id: number; title: string; days: TravelDayTimelineItem[] } | null> {
  const travel = await prisma.travel.findUnique({
    where: { id },
    select: { id: true, title: true },
  })
  if (!travel) return null

  const days = await prisma.travelDay.findMany({
    where: { travelId: id },
    orderBy: { sortOrder: 'asc' },
    include: {
      itineraryItems: {
        orderBy: { sortOrder: 'asc' },
        include: { location: { select: { name: true } } },
      },
      memories: {
        orderBy: { happenedAt: 'asc' },
        include: {
          media: { select: { id: true, storageKey: true, variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } } } },
          mediaLinks: { include: { media: { select: { id: true, storageKey: true, variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } } } } } },
        },
      },
    },
  })

  const mediaUrl = (m: any) =>
    process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET
      ? `${(process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')}/${m.storageKey}`
      : `/uploads/${m.storageKey}`

  /** v3.1 M3-D1：照片优先缩略图（减流量），无变体回退原图 */
  const thumbUrl = (m: any) => {
    const thumb = m?.variants?.[0]?.storageKey
    if (!thumb) return mediaUrl(m)
    return process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET
      ? `${(process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')}/${thumb}`
      : `/uploads/${thumb}`
  }

  const items: TravelDayTimelineItem[] = days.map((d: any) => {
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
      })),
      memories,
      photos,
    }
  })

  return { id: travel.id, title: travel.title, days: items }
}

export interface TravelPublicDetail {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  contentHtml: string
  tags: string[] | null
  location: string | null
  cover: string | null
}

export async function getTravelBySlug(slug: string, userId?: number | null): Promise<TravelPublicDetail | null> {
  if (skipDbOnBuild()) return null
  const t = await prisma.travel.findFirst({ where: { ...scopedWhere(userId, 'ownerId'), slug } as any })
  if (!t) return null

  const contentHtml = await unifiedMarkdownRenderer
    .render(t.content || '')
    .then((r) => r.html)
    .catch(() => '')

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
  }
}

export async function createTravel(input: {
  title: string
  description?: string
  startDate?: string
  endDate?: string
  ownerId?: number | null
  isPublic?: boolean
}): Promise<{ id: number }> {
  const slugBase = input.title.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  const row = await prisma.travel.create({
    data: {
      title: input.title.trim(),
      slug: slugBase || `travel-${Date.now()}`,
      description: input.description || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      status: 'PLANNED',
      ownerId: input.ownerId ?? null,
      isPublic: input.isPublic ?? false,
    },
  })
  await syncTravelPost(row.id).catch(() => {})
  return { id: row.id }
}

export async function updateTravel(id: number, input: any): Promise<void> {
  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) data.description = input.description || null
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null
  if (input.status !== undefined) data.status = input.status
  if (input.isPublic !== undefined) data.isPublic = input.isPublic
  await prisma.travel.update({ where: { id }, data })
  await syncTravelPost(id).catch(() => {})
}

export async function deleteTravel(id: number): Promise<void> {
  await unpublishTravelPost(id).catch(() => {})
  await prisma.travel.delete({ where: { id } })
}

export async function addDay(travelId: number, input: { date?: string; title?: string; summary?: string }): Promise<{ id: number }> {
  const maxOrder = await prisma.travelDay.aggregate({ where: { travelId }, _max: { sortOrder: true } })
  const row = await prisma.travelDay.create({
    data: {
      travelId,
      date: input.date ? new Date(input.date) : null,
      title: input.title || null,
      summary: input.summary || null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  return { id: row.id }
}

export async function updateDay(id: number, input: any): Promise<void> {
  const data: any = {}
  if (input.date !== undefined) data.date = input.date ? new Date(input.date) : null
  if (input.title !== undefined) data.title = input.title || null
  if (input.summary !== undefined) data.summary = input.summary || null
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  await prisma.travelDay.update({ where: { id }, data })
}

export async function deleteDay(id: number): Promise<void> {
  await prisma.travelDay.delete({ where: { id } })
}

const ITINERARY_TYPES = ['SPOT', 'RESTAURANT', 'HOTEL', 'TRANSPORT', 'ACTIVITY', 'OTHER']

/** 兼容 "10:00" / "10:00:00" 时间串，转换为可解析的 Date */
function parseTimeOrDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const d = new Date()
    d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0, 0)
    return d
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export async function addItineraryItem(dayId: number, input: {
  title: string
  startTime?: string
  endTime?: string
  type?: string
  notes?: string
}): Promise<{ id: number }> {
  const maxOrder = await prisma.itineraryItem.aggregate({ where: { travelDayId: dayId }, _max: { sortOrder: true } })
  const row = await prisma.itineraryItem.create({
    data: {
      travelDayId: dayId,
      title: input.title.trim(),
      startTime: parseTimeOrDate(input.startTime),
      endTime: parseTimeOrDate(input.endTime),
      type: ITINERARY_TYPES.includes(input.type || '') ? input.type! : 'SPOT',
      notes: input.notes || null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  return { id: row.id }
}

export async function deleteItineraryItem(id: number): Promise<void> {
  await prisma.itineraryItem.delete({ where: { id } })
}

export async function addExpense(travelId: number, input: {
  amount: number
  currency?: string
  category?: string
  payer?: string
  note?: string
  happenedAt?: string
}): Promise<{ id: number }> {
  const row = await prisma.expense.create({
    data: {
      travelId,
      amount: input.amount,
      currency: input.currency || 'CNY',
      category: input.category || 'OTHER',
      payer: input.payer || null,
      note: input.note || null,
      happenedAt: input.happenedAt ? new Date(input.happenedAt) : null,
    },
  })
  return { id: row.id }
}

export async function deleteExpense(id: number): Promise<void> {
  await prisma.expense.delete({ where: { id } })
}

// ============================================================
// 3.6 子资源所有权校验：判断用户是否可管理该旅行。
// 规则：直接归属（ownerId）或所属空间（spaceId）的活跃 OWNER/MEMBER。
// 与 requireCapability（角色）分层：requireCapability 拦 VIEWER，这里拦「别的空间/别人名下的内容」（IDOR）。
// ============================================================
export async function canManageTravel(travelId: number, userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { ownerId: true, spaceId: true },
  })
  if (!travel) return false
  if (travel.ownerId === userId) return true
  if (travel.spaceId) {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId: travel.spaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'MEMBER'] } },
      select: { id: true },
    })
    if (member) return true
  }
  return false
}

/** 由天反查所属旅行 ID（子资源所有权校验用） */
export async function findTravelIdByDayId(dayId: number): Promise<number | null> {
  const day = await prisma.travelDay.findUnique({ where: { id: dayId }, select: { travelId: true } })
  return day?.travelId ?? null
}

/** 由行程项反查所属旅行 ID（子资源所有权校验用） */
export async function findTravelIdByItineraryItemId(itemId: number): Promise<number | null> {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    select: { travelDay: { select: { travelId: true } } },
  })
  return item?.travelDay?.travelId ?? null
}

/** 由花费反查所属旅行 ID（子资源所有权校验用） */
export async function findTravelIdByExpenseId(expenseId: number): Promise<number | null> {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId }, select: { travelId: true } })
  return expense?.travelId ?? null
}

export { ITINERARY_TYPES }
