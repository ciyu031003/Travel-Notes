/**
 * Timeline：把旅行与回忆按年份聚合，形成“我们的时间线”。
 */
import { prisma } from '../../db'
import { skipDbOnBuild } from '../../db-guard'

export interface TimelineEntry {
  id: number
  type: 'travel' | 'memory'
  title: string
  date: string
  description?: string
  location?: string | null
  slug?: string
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

export async function getTimeline(): Promise<TimelineYear[]> {
  if (skipDbOnBuild()) return []
  const [travels, memories] = await Promise.all([
    prisma.travel.findMany({
      where: { visibility: { in: ['COUPLE', 'PUBLIC'] } },
      select: {
        id: true,
        title: true,
        slug: true,
        startDate: true,
        description: true,
      },
      orderBy: { startDate: 'asc' },
    }),
    prisma.memory.findMany({
      where: { visibility: { in: ['COUPLE', 'PUBLIC'] } },
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

  const grouped = new Map<number, TimelineEntry[]>()

  for (const t of travels) {
    const date = toDate(t.startDate)
    if (!date) continue
    const year = date.getFullYear()
    if (!grouped.has(year)) grouped.set(year, [])
    grouped.get(year)!.push({
      id: t.id,
      type: 'travel',
      title: t.title,
      date: date.toISOString(),
      description: t.description || undefined,
      slug: t.slug,
    })
  }

  for (const m of memories) {
    const date = toDate(m.happenedAt)
    if (!date) continue
    const year = date.getFullYear()
    if (!grouped.has(year)) grouped.set(year, [])
    grouped.get(year)!.push({
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

  return Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, entries]) => ({
      year,
      entries: entries.sort((a, b) => a.date.localeCompare(b.date)),
    }))
}
