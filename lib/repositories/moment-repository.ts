import { prisma } from '../db'
import { skipDbOnBuild } from '../db-guard'

export interface MomentRecord {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
}

export interface MomentRepository {
  create(content: string, tags: string[] | null): Promise<{ id: number }>
  list(page: number, pageSize: number): Promise<{ data: MomentRecord[]; total: number; hasMore: boolean }>
  findById(id: number): Promise<MomentRecord | null>
  delete(id: number): Promise<void>
  count(): Promise<number>
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
  async create(content: string, tags: string[] | null): Promise<{ id: number }> {
    if (skipDbOnBuild()) return { id: 0 }
    const result = await prisma.moment.create({
      data: {
        content,
        tags: tags && tags.length > 0 ? JSON.stringify(tags) : null,
      },
    })
    return { id: result.id }
  }

  async list(page: number, pageSize: number): Promise<{ data: MomentRecord[]; total: number; hasMore: boolean }> {
    if (skipDbOnBuild()) return { data: [], total: 0, hasMore: false }
    const [rows, total] = await Promise.all([
      prisma.moment.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.moment.count(),
    ])

    return {
      data: rows.map((r) => ({
        id: r.id,
        content: r.content,
        tags: parseTags(r.tags),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
      total,
      hasMore: page * pageSize < total,
    }
  }

  async findById(id: number): Promise<MomentRecord | null> {
    const r = await prisma.moment.findUnique({ where: { id } })
    if (!r) return null
    return {
      id: r.id,
      content: r.content,
      tags: parseTags(r.tags),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }
  }

  async delete(id: number): Promise<void> {
    await prisma.moment.delete({ where: { id } })
  }

  async count(): Promise<number> {
    if (skipDbOnBuild()) return 0
    return prisma.moment.count()
  }
}

export const prismaMomentRepository = new PrismaMomentRepository()

