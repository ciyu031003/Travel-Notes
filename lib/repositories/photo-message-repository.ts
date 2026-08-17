import { prisma } from '../db'
import { scopedWhere } from '../visibility'
import { skipDbOnBuild } from '../db-guard'

export interface PhotoMessageRecord {
  id: number
  imageKey: string
  content: string
  createdAt: string
}

export interface PhotoMessageRepository {
  listByImage(imageKey: string, limit: number, userId?: number | null): Promise<PhotoMessageRecord[]>
  create(imageKey: string, content: string, userId?: number | null, isPublic?: boolean): Promise<{ id: number }>
}

export class PrismaPhotoMessageRepository implements PhotoMessageRepository {
  async listByImage(imageKey: string, limit: number, userId?: number | null): Promise<PhotoMessageRecord[]> {
    if (skipDbOnBuild()) return []
    const rows = await prisma.photoMessage.findMany({
      where: { ...scopedWhere(userId), imageKey } as any,
      orderBy: { createdAt: 'asc' },
      take: Math.min(500, Math.max(1, limit)),
    })
    return rows.map((r) => ({
      id: r.id,
      imageKey: r.imageKey,
      content: r.content,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }))
  }

  async create(imageKey: string, content: string, userId?: number | null, isPublic?: boolean): Promise<{ id: number }> {
    if (skipDbOnBuild()) return { id: 0 }
    const result = await prisma.photoMessage.create({
      data: { imageKey, content, userId: userId ?? null, isPublic: isPublic ?? false },
    })
    return { id: result.id }
  }
}

export const prismaPhotoMessageRepository = new PrismaPhotoMessageRepository()
