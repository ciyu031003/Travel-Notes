/**
 * Travel 规划：管理新数据模型下的旅行 → 天数 → 行程项 → 花费。
 * （面向 P2 的行程与花费管理；公开的旅行详情展示属于 P5）
 */
import { prisma } from '../../db'
import { scopedWhere } from '../../visibility'
import { syncTravelPost, unpublishTravelPost } from '../social/travel-post.service'
import { makeTravelSlug } from './slug'
import { unifiedMarkdownRenderer } from '../../infrastructure/markdown'
import { skipDbOnBuild } from '../../db-guard'
import { absoluteMediaUrl, storageKeyToUrl } from '../../media-url'

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
  coverMediaId: number | null
  /** 旅行内回忆照片（缩略图优先），用于旅行地图左侧照片轮播 */
  photos: string[]
  tags: string[] | null
  location: string | null
  updatedAt: string | null
  visibility: string
  spaceId: number | null
  ownerId: number | null
  /** 归档时刻；null = 进行中草稿（首页大入口继续补内容，不进最近旅行与画册） */
  confirmedAt: string | null
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

/** 我的活跃空间 id 列表（用于列表可见性） */
async function myActiveSpaceIds(userId?: number | null): Promise<number[]> {
  if (!userId) return []
  try {
    const rows = await prisma.spaceMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { spaceId: true },
    })
    return rows.map((r) => r.spaceId)
  } catch {
    return []
  }
}

export async function listTravels(userId?: number | null): Promise<TravelSummary[]> {
  if (skipDbOnBuild()) return []
  /**
   * 可见性（R3 修复）：
   *  · 未登录 → 只公开（scopedWhere 的既有语义）
   *  · 登录 → 我名下的 或 公开的 或 **我所在活跃空间里的**
   *
   * 最后一条是缺口：详情页走 `canViewResourceById`（支持 `visibility='SPACE'` + 活跃成员），
   * 而列表原先只认 `ownerId`，于是**同空间成员的旅行在 /travel 里看不到、直接开链接又能看**。
   * 两处口径不一致，用户会以为"同步丢了"。
   */
  const spaceIds = await myActiveSpaceIds(userId)
  const where = userId
    ? spaceIds.length > 0
      ? { OR: [{ ownerId: userId }, { isPublic: true }, { spaceId: { in: spaceIds } }] }
      : scopedWhere(userId, 'ownerId')
    : scopedWhere(userId, 'ownerId')

  const rows = await prisma.travel.findMany({
    where: where as any,
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { days: true } },
      expenses: true,
      coverMedia: { include: { variants: true } },
      days: {
        orderBy: { sortOrder: 'asc' },
        include: {
          memories: {
            orderBy: { happenedAt: 'asc' },
            include: {
              media: {
                select: { id: true, storageKey: true, variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } } },
              },
            },
          },
        },
      },
    },
  })

  /** 单条 media → 优先缩略图，无变体回退原图（减流量，用于旅行地图左侧照片画廊） */
  const thumbOf = (m: any): string | null => {
    const thumb = m?.variants?.find((v: any) => v.variant === 'THUMBNAIL')
    return storageKeyToUrl(thumb?.storageKey ?? m?.storageKey ?? null)
  }

  return rows.map((t: any) => {
    // 收集该旅行的回忆照片（去重），用于旅行地图左侧照片轮播
    const seen = new Set<string>()
    const photos: string[] = []
    for (const day of t.days || []) {
      for (const mem of day.memories || []) {
        for (const m of mem.media || []) {
          const url = thumbOf(m)
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
      expenseTotal: t.expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0),
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
  })
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
  /** 由 coverMedia 规范化出来的封面 URL（缩略图优先）；前台「设为封面」后据此即时可见 */
  coverUrl: string | null
  coverMediaId: number | null
  travelType: string | null
  companions: unknown
  /** 旅行预算（元）；未填为空 → 花销 tab 只显示已花合计 */
  budget: number | null
  /** 归档时刻；null = 进行中草稿 */
  confirmedAt: string | null
}

/**
 * 某本旅行下「回忆照片」的预览图 URL 列表（按时间升序）。
 *
 * 为什么需要：详情页的相册原先只取旅行封面与旧文章图片，**不含回忆里上传的照片**，
 * 于是用户传完照片在最显眼的位置看不到，像是"没传进去"。
 * 这里同时覆盖两种挂载方式：Media.memoryId（主照片）与 MemoryMedia（多对多关联）。
 */
export async function getTravelMemoryPhotos(travelId: number, limit = 60): Promise<string[]> {
  const memories = await prisma.memory.findMany({
    where: { travelId },
    orderBy: [{ happenedAt: 'asc' }, { id: 'asc' }],
    select: {
      media: {
        select: { storageKey: true, variants: { where: { variant: 'PREVIEW' }, select: { storageKey: true } } },
      },
      mediaLinks: {
        orderBy: { sortOrder: 'asc' },
        select: {
          media: {
            select: { storageKey: true, variants: { where: { variant: 'PREVIEW' }, select: { storageKey: true } } },
          },
        },
      },
    },
  })

  const urlOf = (m: { storageKey: string; variants: { storageKey: string }[] }) => {
    const key = m.variants?.[0]?.storageKey || m.storageKey
    if (!key) return ''
    if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
      const base = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')
      return `${base}/${key}`
    }
    return `/uploads/${key}`
  }

  const out: string[] = []
  const seen = new Set<string>()
  for (const mem of memories) {
    for (const m of [...mem.media, ...mem.mediaLinks.map((l) => l.media)]) {
      const url = urlOf(m)
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push(url)
      if (out.length >= limit) return out
    }
  }
  return out
}

export async function getTravelBySlug(slug: string, userId?: number | null): Promise<TravelPublicDetail | null> {  if (skipDbOnBuild()) return null
  const t = await prisma.travel.findFirst({
    where: { ...scopedWhere(userId, 'ownerId'), slug } as any,
    include: { coverMedia: { include: { variants: true } } },
  })
  if (!t) return null

  const contentHtml = await unifiedMarkdownRenderer
    .render(t.content || '')
    .then((r) => r.html)
    .catch(() => '')

  const coverThumb = (t as any).coverMedia?.variants?.find((v: any) => v.variant === 'THUMBNAIL')?.storageKey
  const coverKey = (t as any).coverMedia?.storageKey
  const coverUrl = storageKeyToUrl(coverThumb ?? coverKey ?? null) ?? absoluteMediaUrl(t.cover ?? null)

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
    coverMediaId: (t as any).coverMediaId ?? null,
    travelType: t.travelType ?? 'ALONE',
    companions: t.companions ?? null,
    budget: isoBudget((t as any).budget),
    confirmedAt: iso((t as any).confirmedAt),
  }
}

/** 预算归一：非有限数或负数一律视为"未设置" */
function isoBudget(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export async function createTravel(input: {
  title: string
  description?: string
  startDate?: string
  endDate?: string
  /**
   * 目的地。落 `Travel.location`。
   * 为什么重要：旅行画册按城市成册时用 `findCityByName(Travel.location)` 匹配
   * （lib/modules/album/travel-book.service.ts）；此字段为空时画册只能退化用标题当城市，
   * 容易出现"串册 / 归错城市"。所以新建表单必须能写入它。
   */
  location?: string
  ownerId?: number | null
  isPublic?: boolean
  travelType?: 'ALONE' | 'COUPLE' | 'FAMILY' | 'FRIENDS' | 'BFF' | 'GROUP' | 'OTHER'
  companions?: unknown
}): Promise<{ id: number; slug: string }> {
  // slug 走共享生成器，并做唯一化重试：
  // 早先直接拿 makeTravelSlug 的结果写库，同一标题建两次就撞 Travel.slug 唯一约束（P2002），
  // 前台表现为"点了开始记录没反应"。同名旅行是常态（"南京之行"人人都可能建），必须能共存。
  const slug = await makeUniqueTravelSlug(makeTravelSlug(input.title))
  const row = await prisma.travel.create({
    data: {
      title: input.title.trim(),
      slug,
      description: input.description || null,
      location: input.location?.trim() || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      status: 'PLANNED',
      ownerId: input.ownerId ?? null,
      isPublic: input.isPublic ?? false,
      travelType: (input.travelType ?? 'ALONE') as any,
      companions: input.companions ?? undefined,
    },
    // 只回读 id：避免引擎 select-back 整行时对 Json 列（companions）二次序列化（配合 jsonStrings 双保险）
    select: { id: true },
  })
  await syncTravelPost(row.id).catch(() => {})
  // 按日期区间自动生成「天」。
  // 为什么必须做：详情页的按天时间线（TravelTimeline）在 0 天时 `return null`，
  // 于是新旅行既看不到分天结构、也点不到「添加行程」——用户建完旅行无处可动手。
  await ensureTravelDays(row.id, input.startDate, input.endDate).catch(() => {})
  // 回传 slug：前台「新建旅行 → 直接进该旅行详情页」需要它（详情路由是 /travel/[slug]）
  return { id: row.id, slug }
}

/**
 * slug 唯一化：`南京之行` 第二次创建时追加 `-2`、`-3`…（最多试 50 次）。
 *
 * 为什么必须做：`Travel.slug` 有唯一约束，而标题是用户自由输入的天然重复项。
 * 早先重复标题会让 prisma.create 抛 P2002，接口 500，前台只看到"创建失败"。
 * @param excludeId 编辑场景下排除自己，避免"只改了日期也被判为重复"
 */
export async function makeUniqueTravelSlug(base: string, excludeId?: number): Promise<string> {
  const taken = async (slug: string) => {
    const found = await prisma.travel.findFirst({
      where: excludeId ? { slug, id: { not: excludeId } } : { slug },
      select: { id: true },
    })
    return !!found
  }
  if (!(await taken(base))) return base
  for (let i = 2; i <= 50; i++) {
    const candidate = `${base}-${i}`
    if (!(await taken(candidate))) return candidate
  }
  // 极端情况兜底：加时间戳，几乎不可能再撞
  return `${base}-${Date.now()}`
}

/**
 * 编辑旅行基本信息（标题 / 目的地 / 日期区间 / 描述）。
 *
 * 与 `createTravel` 对称：改标题时同步重算 slug，并返回新 slug —— 前台据此决定是否
 * 需要把地址从旧 slug 跳到新 slug（否则用户改完名字，刷新就 404）。
 * 日期区间变化时同步 TravelDay（见 syncTravelDayDates）。
 */
export async function updateTravelInfo(
  id: number,
  input: {
    title?: string
    location?: string
    startDate?: string | null
    endDate?: string | null
    description?: string | null
    /** 预算（元）。传 null 表示清空；缺省表示不改 */
    budget?: number | null
    /** 封面媒体 id（前台相册「设为封面」）。必须属于这本旅行，见 assertCoverMediaBelongs */
    coverMediaId?: number | null
  },
): Promise<{ slug: string; daysChanged: number }> {
  const current = await prisma.travel.findUnique({
    where: { id },
    select: { title: true, slug: true, startDate: true, endDate: true },
  })
  if (!current) throw new Error('旅行不存在')

  const title = input.title !== undefined ? input.title.trim() : undefined
  if (title !== undefined && !title) throw new Error('旅行名称不能为空')
  if (title !== undefined && title.length > 120) throw new Error('旅行名称过长（最多 120 字）')

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title
  if (input.location !== undefined) data.location = input.location.trim() || null
  if (input.description !== undefined) data.description = input.description?.trim() || null
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null
  if (input.budget !== undefined) {
    if (input.budget === null) {
      data.budget = null
    } else {
      const n = Number(input.budget)
      // 负预算/NaN 直接拒绝：进度条会算出负百分比，比"没填"更糟
      if (!Number.isFinite(n) || n < 0) throw new Error('预算需为不小于 0 的数字')
      if (n > 100_000_000) throw new Error('预算数值过大')
      data.budget = n
    }
  }
  if (input.coverMediaId !== undefined) {
    if (input.coverMediaId === null) {
      data.coverMediaId = null
    } else {
      // 封面必须属于这本旅行，否则可以把别人的照片设成自己的封面
      await assertCoverMediaBelongs(id, input.coverMediaId)
      data.coverMediaId = input.coverMediaId
    }
  }

  // 日期倒置会让「按天」生成负天数；在服务层挡掉，而不是让前台各自判一遍
  const s = (data.startDate as Date | null | undefined) ?? current.startDate
  const e = (data.endDate as Date | null | undefined) ?? current.endDate
  if (s && e && e.getTime() < s.getTime()) throw new Error('结束日期不能早于开始日期')

  // 改标题 → 重算 slug（保持"地址跟着名字走"），旧链接由前台 replace 掉
  let slug = current.slug
  if (title !== undefined && title !== current.title) {
    slug = await makeUniqueTravelSlug(makeTravelSlug(title), id)
    data.slug = slug
  }

  await prisma.travel.update({ where: { id }, data, select: { id: true } })
  await syncTravelPost(id).catch(() => {})

  // 日期变了 → 已存在的「天」要跟着对齐，否则时间线还停在旧日期上
  const daysChanged =
    input.startDate !== undefined || input.endDate !== undefined
      ? await syncTravelDayDates(id, s, e).catch(() => 0)
      : 0

  return { slug, daysChanged }
}

/**
 * 把 `TravelDay` 的日期对齐到旅行区间。
 *
 * 语义（有意选择"就地对齐"而不是"删了重建"）：
 *  · 第 i 天的日期 = 开始日 + i 天；
 *  · 区间变长 → 补出缺失的天；变短 → **保留**多出来的天（里面可能已有回忆/照片，删掉等于毁数据），
 *    只是不再改动它们的日期；
 *  · 原来没有天的旅行（未填日期就建了）→ 至少补出 1 天，保证详情页有可下手的地方。
 * 返回实际被改动的天数。
 */
export async function syncTravelDayDates(travelId: number, startDate: Date | null, endDate: Date | null): Promise<number> {
  const days = await prisma.travelDay.findMany({
    where: { travelId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, date: true, sortOrder: true },
  })

  // 没有开始日 → 无法对齐，但至少要保证有 1 天可写
  if (!startDate || Number.isNaN(startDate.getTime())) {
    if (days.length > 0) return 0
    return (await ensureTravelDays(travelId, null, null)).created
  }

  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  const end =
    endDate && !Number.isNaN(endDate.getTime())
      ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
      : start
  const span = Math.max(0, Math.min(Math.round((end.getTime() - start.getTime()) / 86_400_000), 59)) + 1

  let changed = 0
  for (let i = 0; i < Math.min(days.length, span); i++) {
    const target = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const day = days[i]
    const same = day.date && new Date(day.date).toDateString() === target.toDateString()
    if (same) continue
    await prisma.travelDay.update({ where: { id: day.id }, data: { date: target } })
    changed++
  }

  // 区间比现有天数长 → 补齐（沿用 ensureTravelDays 的天数上限语义）
  if (span > days.length) {
    const maxOrder = await prisma.travelDay.aggregate({ where: { travelId }, _max: { sortOrder: true } })
    const base = (maxOrder._max.sortOrder ?? days.length - 1) + 1
    const extra: { travelId: number; date: Date; title: string; sortOrder: number }[] = []
    for (let i = days.length; i < span; i++) {
      extra.push({
        travelId,
        date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
        title: `DAY ${String(i + 1).padStart(2, '0')}`,
        sortOrder: base + (i - days.length),
      })
    }
    if (extra.length > 0) {
      await prisma.travelDay.createMany({ data: extra })
      changed += extra.length
    }
  }

  return changed
}

/**
 * 确保旅行有对应的「天」：已有天则不重复创建。
 * 日期区间解析失败（未填日期/区间倒置）时按 1 天处理，保证详情页仍有可编辑的一天。
 */
export async function ensureTravelDays(
  travelId: number,
  startDate?: string | null,
  endDate?: string | null,
): Promise<{ created: number }> {
  const existing = await prisma.travelDay.count({ where: { travelId } })
  if (existing > 0) return { created: 0 }

  const dates: Date[] = []
  const s = startDate ? new Date(startDate) : null
  const e = endDate ? new Date(endDate) : null
  if (s && !Number.isNaN(s.getTime())) {
    const start = new Date(s.getFullYear(), s.getMonth(), s.getDate())
    const end = e && !Number.isNaN(e.getTime()) ? new Date(e.getFullYear(), e.getMonth(), e.getDate()) : start
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
    if (days >= 0) {
      // 上限 60 天：避免误填超长区间产生海量空天
      for (let i = 0; i <= Math.min(days, 59); i++) {
        dates.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
      }
    }
  }
  if (dates.length === 0) dates.push(new Date())

  await prisma.travelDay.createMany({
    data: dates.map((d, i) => ({
      travelId,
      date: d,
      title: `DAY ${String(i + 1).padStart(2, '0')}`,
      sortOrder: i,
    })),
  })
  return { created: dates.length }
}

export async function updateTravel(id: number, input: any): Promise<void> {
  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) data.description = input.description || null
  // 目的地：后台表单此前不支持改它，而画册按城市成册依赖 `location`，
  // 导致"目的地填错了只能删了重建"。补上。
  if (input.location !== undefined) data.location = input.location?.trim() || null
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null
  if (input.status !== undefined) data.status = input.status
  if (input.isPublic !== undefined) data.isPublic = input.isPublic
  // 预算：同步队列（原生壳）与后台都可能带上来；非法值静默丢弃而不是把脏值写进库
  if (input.budget !== undefined) {
    if (input.budget === null) data.budget = null
    else {
      const n = Number(input.budget)
      if (Number.isFinite(n) && n >= 0 && n <= 100_000_000) data.budget = n
    }
  }
  if (input.travelType !== undefined) data.travelType = input.travelType
  if (input.companions !== undefined) data.companions = input.companions
  await prisma.travel.update({ where: { id }, data, select: { id: true } })
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

/** 前台花销 tab：流水 + 合计（预算在 Travel.budget，随 getTravelBySlug 下发） */
export async function getTravelExpenses(travelId: number): Promise<{
  expenses: ExpenseRecord[]
  total: number
}> {
  const travel = await prisma.travel.findUnique({ where: { id: travelId }, select: { id: true } })
  if (!travel) throw new Error('旅行不存在')
  const rows = await prisma.expense.findMany({
    where: { travelId },
    orderBy: [{ happenedAt: 'asc' }, { id: 'asc' }],
  })
  const expenses = rows.map((e: any) => ({
    id: e.id,
    amount: e.amount,
    currency: e.currency,
    category: e.category,
    payer: e.payer,
    note: e.note,
    happenedAt: iso(e.happenedAt),
  }))
  return { expenses, total: expenses.reduce((s: number, e: ExpenseRecord) => s + (e.amount || 0), 0) }
}

/**
 * 封面媒体必须属于这本旅行。
 * Media 表本身没有 travelId，只能顺着「回忆 → 旅行」反查（主照片与多对多关联两条路径）。
 */
export async function assertCoverMediaBelongs(travelId: number, mediaId: number): Promise<void> {
  const media: any = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      memory: { select: { travelId: true } },
      memoryLinks: { select: { memory: { select: { travelId: true } } } },
    },
  })
  if (!media) throw new Error('照片不存在')
  const owners: (number | null)[] = [
    media.memory?.travelId ?? null,
    ...(media.memoryLinks || []).map((l: any) => l.memory?.travelId ?? null),
  ]
  if (!owners.includes(travelId)) throw new Error('这张照片不属于该旅行')
}

/** 修改一个行程项（此前前台只能加、不能改：加错了只能删掉整段旅行重建） */
export async function updateItineraryItem(
  id: number,
  input: { title?: string; startTime?: string | null; endTime?: string | null; type?: string; notes?: string | null },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) throw new Error('行程名称不能为空')
    if (t.length > 120) throw new Error('名称过长（最多 120 字）')
    data.title = t
  }
  if (input.startTime !== undefined) data.startTime = parseTimeOrDate(input.startTime)
  if (input.endTime !== undefined) data.endTime = parseTimeOrDate(input.endTime)
  if (input.type !== undefined) data.type = ITINERARY_TYPES.includes(input.type) ? input.type : 'SPOT'
  if (input.notes !== undefined) data.notes = input.notes ? String(input.notes).slice(0, 500) : null
  if (Object.keys(data).length === 0) return
  await prisma.itineraryItem.update({ where: { id }, data })
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
