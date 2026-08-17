/**
 * Timeline：把旅行记录与回忆按年份聚合，形成"我们的时间线"。
 * 数据来源（自动合并、按日期排序、按 slug 去重）：
 *  1. 旧版旅行记录 Post（type='travel'，含已上传的游记与其日期）
 *  2. 新版旅行 Travel（startDate）
 *  3. 回忆 Memory（happenedAt）
 *  4. 统一时间线条目 TimelineItem（若有）
 */
import { prisma } from '../../db'
import { scopedWhere } from '../../visibility'
import { skipDbOnBuild } from '../../db-guard'

export interface TimelineEntry {
  id: number
  type: 'travel' | 'memory'
  title: string
  date: string
  description?: string
  location?: string | null
  slug?: string
  cover?: string | null
  travelTitle?: string
  mood?: string | null
}

export interface TimelineYear {
  year: number
  entries: TimelineEntry[]
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/** Post 旧表 id 与 Travel 新表 id 可能重复，用负数偏移避免 React key 冲突 */
const POST_ID_OFFSET = -1000000

export async function getTimeline(userId?: number | null): Promise<TimelineYear[]> {
  if (skipDbOnBuild()) return []

  const [items, travels, posts, memories] = await Promise.all([
    prisma.timelineItem
      .findMany({
        where: userId ? { userId } : {},
        orderBy: { happenedAt: 'asc' },
        take: 500,
      })
      .catch(() => []),
    prisma.travel.findMany({
      where: { ...scopedWhere(userId, 'ownerId'), visibility: { in: ['COUPLE', 'PUBLIC'] } } as any,
      select: { id: true, title: true, slug: true, startDate: true, description: true, cover: true },
      orderBy: { startDate: 'asc' },
    }),
    prisma.post.findMany({
      where: { ...scopedWhere(userId), type: 'travel', published: true } as any,
      select: { id: true, title: true, slug: true, date: true, summary: true, location: true, cover: true },
      orderBy: { date: 'asc' },
    }),
    prisma.memory.findMany({
      where: userId
        ? { OR: [{ createdById: userId }, { visibility: 'PUBLIC' }] }
        : { visibility: 'PUBLIC' },
      select: {
        id: true,
        title: true,
        happenedAt: true,
        content: true,
        mood: true,
        location: { select: { name: true } },
        travel: { select: { title: true } },
      },
      orderBy: { happenedAt: 'asc' },
    }),
  ])

  // 新版 Travel 优先：Post 中与 Travel slug 相同的记录视为同一段旅行，去重
  const travelSlugs = new Set(travels.map((t) => t.slug))

  const grouped = new Map<number, TimelineEntry[]>()

  const push = (date: Date, entry: TimelineEntry) => {
    const year = date.getFullYear()
    if (!grouped.has(year)) grouped.set(year, [])
    grouped.get(year)!.push(entry)
  }

  // 1. 统一时间线条目（TRIP → 旅行，其余 → 回忆）
  for (const item of items) {
    const date = toDate(item.happenedAt)
    if (!date) continue
    push(date, {
      id: item.id,
      type: item.type === 'TRIP' ? 'travel' : 'memory',
      title: item.title,
      date: date.toISOString(),
      description: item.description || undefined,
    })
  }

  // 2. 新版旅行 Travel（按 startDate 自动排序）
  for (const t of travels) {
    const date = toDate(t.startDate)
    if (!date) continue
    push(date, {
      id: t.id,
      type: 'travel',
      title: t.title,
      date: date.toISOString(),
      description: t.description || undefined,
      slug: t.slug,
      cover: t.cover,
    })
  }

  // 3. 旧版旅行记录 Post（生产库的 4 篇游记在此；按 date 自动排序）
  for (const p of posts) {
    if (p.slug && travelSlugs.has(p.slug)) continue // 已在 Travel 中展示
    const date = toDate(p.date)
    if (!date) continue
    push(date, {
      id: p.id + POST_ID_OFFSET,
      type: 'travel',
      title: p.title,
      date: date.toISOString(),
      description: p.summary || undefined,
      location: p.location,
      slug: p.slug,
      cover: p.cover,
    })
  }

  // 4. 回忆 Memory（happenedAt）
  for (const m of memories) {
    const date = toDate(m.happenedAt)
    if (!date) continue
    push(date, {
      id: m.id,
      type: 'memory',
      title: m.title,
      date: date.toISOString(),
      description: m.content ? m.content.slice(0, 200) : undefined,
      location: m.location?.name ?? null,
      mood: m.mood ?? null,
      travelTitle: m.travel?.title,
    })
  }

  // 年份倒序，同年份内按日期正序（旅程先后）
  return Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, entries]) => ({
      year,
      entries: entries.sort((a, b) => a.date.localeCompare(b.date)),
    }))
}
