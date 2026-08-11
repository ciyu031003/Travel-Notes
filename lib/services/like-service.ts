import { LikeRepository } from '../repositories/like-repository'
import { CacheService } from '../infrastructure/cache'

const TARGET_TYPES = new Set(['post', 'moment'])

export interface LikeState {
  count: number
  liked: boolean
}

export class LikeService {
  private readonly CACHE_TTL = 60

  constructor(
    private readonly likeRepo: LikeRepository,
    private readonly cache: CacheService,
  ) {}

  async getState(targetType: string, targetId: string, visitorId?: string): Promise<LikeState> {
    if (!TARGET_TYPES.has(targetType)) {
      throw new Error('不支持的点赞类型')
    }
    if (!targetId) {
      throw new Error('缺少点赞目标')
    }

    const cacheKey = `likes:${targetType}:${targetId}`
    const cached = await this.cache.get<number>(cacheKey)
    const count = cached !== null ? cached : await this.likeRepo.count(targetType, targetId)
    if (cached === null) {
      await this.cache.set(cacheKey, count, this.CACHE_TTL, ['likes'])
    }

    let liked = false
    if (visitorId) {
      liked = await this.likeRepo.hasLiked(targetType, targetId, visitorId)
    }

    return { count, liked }
  }

  async getTotalCount(): Promise<number> {
    const cacheKey = 'likes:total'
    const cached = await this.cache.get<number>(cacheKey)
    if (cached !== null) return cached
    const count = await this.likeRepo.countAll()
    await this.cache.set(cacheKey, count, this.CACHE_TTL, ['likes'])
    return count
  }

  async toggle(targetType: string, targetId: string, visitorId: string): Promise<LikeState> {
    if (!TARGET_TYPES.has(targetType)) {
      throw new Error('不支持的点赞类型')
    }
    if (!targetId) {
      throw new Error('缺少点赞目标')
    }
    if (!visitorId || visitorId.length < 8 || visitorId.length > 64) {
      throw new Error('缺少有效的访客标识')
    }

    const liked = await this.likeRepo.hasLiked(targetType, targetId, visitorId)
    if (liked) {
      await this.likeRepo.remove(targetType, targetId, visitorId)
    } else {
      await this.likeRepo.add(targetType, targetId, visitorId)
    }

    await this.cache.deleteByTag('likes')
    const count = await this.likeRepo.count(targetType, targetId)
    await this.cache.set(`likes:${targetType}:${targetId}`, count, this.CACHE_TTL, ['likes'])

    return { count, liked: !liked }
  }
}

