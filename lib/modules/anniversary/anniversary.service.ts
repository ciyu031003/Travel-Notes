/**
 * Anniversary：纪念日管理（第一次见面/第一次旅行/生日等）
 */
import { prisma } from '../../db'

export interface AnniversaryRecord {
  id: number
  title: string
  date: string
  recurring: boolean
  description: string | null
  coverMediaId: number | null
  createdAt: string
  updatedAt: string
}

export interface AnniversaryInput {
  title: string
  date: Date
  recurring?: boolean
  description?: string
}

function map(r: any): AnniversaryRecord {
  return {
    id: r.id,
    title: r.title,
    date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
    recurring: r.recurring,
    description: r.description,
    coverMediaId: r.coverMediaId,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  }
}

export async function listAnniversaries(): Promise<AnniversaryRecord[]> {
  const rows = await prisma.anniversary.findMany({ orderBy: { date: 'asc' } })
  return rows.map(map)
}

export async function createAnniversary(input: AnniversaryInput): Promise<{ id: number }> {
  const row = await prisma.anniversary.create({
    data: {
      title: input.title,
      date: input.date,
      recurring: input.recurring ?? true,
      description: input.description || null,
    },
  })
  return { id: row.id }
}

export async function updateAnniversary(id: number, input: Partial<AnniversaryInput>): Promise<void> {
  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.date !== undefined) data.date = input.date
  if (input.recurring !== undefined) data.recurring = input.recurring
  if (input.description !== undefined) data.description = input.description || null
  await prisma.anniversary.update({ where: { id }, data })
}

export async function deleteAnniversary(id: number): Promise<void> {
  await prisma.anniversary.delete({ where: { id } })
}

/** 计算下次纪念日的剩余天数 */
export function daysUntilNext(date: Date, recurring: boolean): number {
  const now = new Date()
  const target = new Date(date)

  if (!recurring) {
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000))
  }

  // 周年纪念：计算下一次同月同日
  const next = new Date(now.getFullYear(), target.getMonth(), target.getDate())
  if (next.getTime() < now.setHours(0, 0, 0, 0)) {
    next.setFullYear(next.getFullYear() + 1)
  }
  return Math.ceil((next.getTime() - new Date(now).setHours(0, 0, 0, 0)) / 86400000)
}
