import { prisma } from '../db'
import { scopedWhere } from '../visibility'
import { skipDbOnBuild } from '../db-guard'

export interface MomentRecord {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
  updatedAt: string
  userId: number | null
  isPublic: boolean
}

export interface MomentRepository {
  create(content: string, tags: string[] | null, userId?: number | null, isPublic?: boolean): Promise<{ id: number }>
  list(page: number, pageSize: number, userId?: number | null): Promise<{ data: MomentRecord[]; total: number; hasMore: boolean }>
  findById(id: number, userId?: number | null): Promise<MomentRecord | null>
  delete(id: number): Promise<void>
  count(userId?: number | null): Promise<number>
}

function parseTags(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : null
  } catch {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
}

export class PrismaMomentRepository implements MomentRepository {
  async create(content: string, tags: string[] | null, userId?: number | null, isPublic?: boolean): Promise<{ id: number }> {
    if (skipDbOnBuild()) return { id: 0 }
    const result = await prisma.moment.create({
      data: {
        content,
        tags: tags && tags.length > 0 ? JSON.stringify(tags) : null,
        userId: userId ?? null,
        isPublic: isPublic ?? false,
      },
    })
    return { id: result.id }
  }

  async list(page: number, pageSize: number, userId?: number | null): Promise<{ data: MomentRecord[]; total: number; hasMore: boolean }> {
    if (skipDbOnBuild()) return { data: [], total: 0, hasMore: false }
    const where = scopedWhere(userId) as any
    const [rows, total] = await Promise.all([
      prisma.moment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.moment.count({ where }),
    ])

    return {
      data: rows.map((r) => ({
        id: r.id,
        content: r.content,
        tags: parseTags(r.tags),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
        userId: r.userId ?? null,
        isPublic: !!r.isPublic,
      })),
      total,
      hasMore: page * pageSize < total,
    }
  }

  async findById(id: number, userId?: number | null): Promise<MomentRecord | null> {
    const r = await prisma.moment.findFirst({ where: { ...scopedWhere(userId), id } as any })
    if (!r) return null
    return {
      id: r.id,
      content: r.content,
      tags: parseTags(r.tags),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      userId: r.userId ?? null,
      isPublic: !!r.isPublic,
    }
  }

  async delete(id: number): Promise<void> {
    await prisma.moment.delete({ where: { id } })
  }

  async count(userId?: number | null): Promise<number> {
    if (skipDbOnBuild()) return 0
    return prisma.moment.count({ where: scopedWhere(userId) as any })
  }
}

export const prismaMomentRepository = new PrismaMomentRepository()

