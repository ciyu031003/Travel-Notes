import { prisma } from '../db'
import { skipDbOnBuild } from '../db-guard'

export interface LikeRepository {
  countAll(): Promise<number>
  count(targetType: string, targetId: string): Promise<number>
  hasLiked(targetType: string, targetId: string, visitorId: string): Promise<boolean>
  add(targetType: string, targetId: string, visitorId: string): Promise<boolean>
  remove(targetType: string, targetId: string, visitorId: string): Promise<boolean>
}

export class PrismaLikeRepository implements LikeRepository {
  async countAll(): Promise<number> {
    if (skipDbOnBuild()) return 0
    return prisma.like.count()
  }

  async count(targetType: string, targetId: string): Promise<number> {
    if (skipDbOnBuild()) return 0
    return prisma.like.count({
      where: { targetType, targetId },
    })
  }

  async hasLiked(targetType: string, targetId: string, visitorId: string): Promise<boolean> {
    if (skipDbOnBuild()) return false
    const found = await prisma.like.findUnique({
      where: {
        targetType_targetId_visitorId: { targetType, targetId, visitorId },
      },
      select: { id: true },
    })
    return found !== null
  }

  async add(targetType: string, targetId: string, visitorId: string): Promise<boolean> {
    try {
      await prisma.like.create({
        data: { targetType, targetId, visitorId },
      })
      return true
    } catch {
      // 唯一约束冲突（重复点赞）视为已点赞
      return false
    }
  }

  async remove(targetType: string, targetId: string, visitorId: string): Promise<boolean> {
    try {
      const result = await prisma.like.deleteMany({
        where: { targetType, targetId, visitorId },
      })
      return result.count > 0
    } catch {
      return false
    }
  }
}

export const prismaLikeRepository = new PrismaLikeRepository()


