/**
 * Memory 数据访问（Repository）—— 回忆是 Travel-Notes 的核心实体（§31）
 */
import { prisma } from '../../db'

export type MemoryVisibility = 'PRIVATE' | 'COUPLE' | 'PUBLIC'

export interface MemoryRecord {
  id: number
  spaceId: number
  travelId: number | null
  travelDayId: number | null
  title: string
  content: string | null
  happenedAt: string | null
  locationId: number | null
  mood: string | null
  visibility: MemoryVisibility
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateMemoryInput {
  spaceId: number
  travelId?: number | null
  travelDayId?: number | null
  title: string
  content?: string | null
  happenedAt?: Date | string | null
  locationId?: number | null
  mood?: string | null
  visibility?: MemoryVisibility
  createdBy: string
}

export type UpdateMemoryPatch = Partial<Omit<CreateMemoryInput, 'spaceId' | 'createdBy'>>

function serialize(m: any): MemoryRecord {
  return {
    id: m.id,
    spaceId: m.spaceId,
    travelId: m.travelId,
    travelDayId: m.travelDayId,
    title: m.title,
    content: m.content,
    happenedAt: m.happenedAt ? new Date(m.happenedAt).toISOString() : null,
    locationId: m.locationId,
    mood: m.mood,
    visibility: m.visibility,
    createdBy: m.createdBy,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

export class PrismaMemoryRepository {
  async create(input: CreateMemoryInput): Promise<number> {
    const m = await prisma.memory.create({
      data: {
        spaceId: input.spaceId,
        travelId: input.travelId ?? null,
        travelDayId: input.travelDayId ?? null,
        title: input.title,
        content: input.content ?? null,
        happenedAt: input.happenedAt ? new Date(input.happenedAt) : null,
        locationId: input.locationId ?? null,
        mood: input.mood ?? null,
        visibility: (input.visibility ?? 'COUPLE') as any,
        createdBy: input.createdBy,
      },
    })
    return m.id
  }

  async findById(id: number): Promise<MemoryRecord | null> {
    const m = await prisma.memory.findUnique({ where: { id } })
    return m ? serialize(m) : null
  }

  async listForSpace(spaceId: number, travelId?: number | null): Promise<MemoryRecord[]> {
    const rows = await prisma.memory.findMany({
      where: { spaceId, ...(travelId ? { travelId } : {}) },
      orderBy: [{ happenedAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map(serialize)
  }

  async update(id: number, patch: UpdateMemoryPatch): Promise<MemoryRecord | null> {
    const data: any = {}
    if (patch.title !== undefined) data.title = patch.title
    if (patch.content !== undefined) data.content = patch.content ?? null
    if (patch.happenedAt !== undefined) data.happenedAt = patch.happenedAt ? new Date(patch.happenedAt) : null
    if (patch.travelId !== undefined) data.travelId = patch.travelId ?? null
    if (patch.travelDayId !== undefined) data.travelDayId = patch.travelDayId ?? null
    if (patch.locationId !== undefined) data.locationId = patch.locationId ?? null
    if (patch.mood !== undefined) data.mood = patch.mood ?? null
    if (patch.visibility !== undefined) data.visibility = patch.visibility as any
    if (Object.keys(data).length === 0) return this.findById(id)
    const m = await prisma.memory.update({ where: { id }, data })
    return serialize(m)
  }

  async remove(id: number): Promise<void> {
    await prisma.memory.delete({ where: { id } })
  }
}

export const prismaMemoryRepository = new PrismaMemoryRepository()
