/**
 * Travel 数据访问（Repository）—— 旅行为回忆提供时间线容器（§29-§30）
 */
import { prisma } from '../../db'

export type TravelStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED'
export type TravelVisibility = 'PRIVATE' | 'SPACE' | 'PUBLIC'
export type TravelType = 'ALONE' | 'COUPLE' | 'FAMILY' | 'FRIENDS' | 'BFF' | 'GROUP' | 'OTHER'

export interface TravelRecord {
  id: number
  spaceId: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  coverMediaId: number | null
  status: TravelStatus
  visibility: TravelVisibility
  travelType: TravelType
  companions: unknown | null
  createdAt: string
  updatedAt: string
}

export interface CreateTravelInput {
  spaceId: number
  title: string
  slug: string
  description?: string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
  status?: TravelStatus
  visibility?: TravelVisibility
  travelType?: TravelType
  companions?: unknown
}

export type UpdateTravelPatch = Partial<Omit<CreateTravelInput, 'spaceId'>>

function serialize(t: any): TravelRecord {
  return {
    id: t.id,
    spaceId: t.spaceId,
    title: t.title,
    slug: t.slug,
    description: t.description,
    startDate: t.startDate ? new Date(t.startDate).toISOString() : null,
    endDate: t.endDate ? new Date(t.endDate).toISOString() : null,
    coverMediaId: t.coverMediaId,
    status: t.status,
    visibility: t.visibility,
    travelType: t.travelType ?? 'ALONE',
    companions: t.companions ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

export class PrismaTravelRepository {
  async create(input: CreateTravelInput): Promise<number> {
    const t = await prisma.travel.create({
      data: {
        spaceId: input.spaceId,
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        status: (input.status ?? 'PLANNED') as any,
        visibility: (input.visibility ?? 'SPACE') as any,
        travelType: (input.travelType ?? 'ALONE') as any,
        companions: input.companions ?? undefined,
      },
      // 只回读 id：避免引擎对 Json 列（companions）select-back 序列化出错
      select: { id: true },
    })
    return t.id
  }

  async findById(id: number): Promise<TravelRecord | null> {
    const t = await prisma.travel.findUnique({ where: { id } })
    return t ? serialize(t) : null
  }

  async slugExists(spaceId: number, slug: string, excludeId?: number): Promise<boolean> {
    const row = await prisma.travel.findFirst({
      where: { spaceId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
    return row !== null
  }

  async listForSpace(spaceId: number): Promise<TravelRecord[]> {
    const rows = await prisma.travel.findMany({
      where: { spaceId },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    })
    return rows.map(serialize)
  }

  async update(id: number, patch: UpdateTravelPatch): Promise<TravelRecord | null> {
    const data: any = {}
    if (patch.title !== undefined) data.title = patch.title
    if (patch.slug !== undefined) data.slug = patch.slug
    if (patch.description !== undefined) data.description = patch.description ?? null
    if (patch.startDate !== undefined) data.startDate = patch.startDate ? new Date(patch.startDate) : null
    if (patch.endDate !== undefined) data.endDate = patch.endDate ? new Date(patch.endDate) : null
    if (patch.status !== undefined) data.status = patch.status as any
    if (patch.visibility !== undefined) data.visibility = patch.visibility as any
    if (patch.travelType !== undefined) data.travelType = patch.travelType as any
    if (patch.companions !== undefined) data.companions = patch.companions
    if (Object.keys(data).length === 0) return this.findById(id)
    // 只回读 id 再反查：update 的 select-back 同样会踩 Json 列序列化问题（配合 jsonStrings 双保险）
    await prisma.travel.update({ where: { id }, data, select: { id: true } })
    return this.findById(id)
  }

  async remove(id: number): Promise<void> {
    await prisma.travel.delete({ where: { id } })
  }
}

export const prismaTravelRepository = new PrismaTravelRepository()
