import { prisma } from '../db'
import { skipDbOnBuild } from '../db-guard'

export interface PhotoMessageRecord {
  id: number
  imageKey: string
  content: string
  createdAt: string
}

export interface PhotoMessageRepository {
  listByImage(imageKey: string, limit: number): Promise<PhotoMessageRecord[]>
  create(imageKey: string, content: string): Promise<{ id: number }>
}

export class PrismaPhotoMessageRepository implements PhotoMessageRepository {
  async listByImage(imageKey: string, limit: number): Promise<PhotoMessageRecord[]> {
    if (skipDbOnBuild()) return []
    const rows = await prisma.photoMessage.findMany({
      where: { imageKey },
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

  async create(imageKey: string, content: string): Promise<{ id: number }> {
    if (skipDbOnBuild()) return { id: 0 }
    const result = await prisma.photoMessage.create({
      data: { imageKey, content },
    })
    return { id: result.id }
  }
}

export const prismaPhotoMessageRepository = new PrismaPhotoMessageRepository()
