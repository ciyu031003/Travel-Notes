import { MomentRepository, MomentRecord } from '../repositories/moment-repository'
import { CacheService } from '../infrastructure/cache'
import { checkContent } from '../modules/content/policy'

export interface MomentDTO {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
  updatedAt: string
  userId: number | null
  isPublic: boolean
}

export interface MomentPage {
  data: MomentDTO[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export class MomentService {
  private readonly CACHE_TTL = 120

  constructor(
    private readonly momentRepo: MomentRepository,
    private readonly cache: CacheService,
  ) {}

  async getMoments(page: number = 1, pageSize: number = 20, userId?: number | null): Promise<MomentPage> {
    const cacheKey = `moments:${page}:${pageSize}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<MomentPage>(cacheKey)
    if (cached) return cached

    const result = await this.momentRepo.list(page, pageSize, userId)
    const pageData: MomentPage = {
      data: result.data,
      total: result.total,
      page,
      pageSize,
      hasMore: result.hasMore,
    }
    await this.cache.set(cacheKey, pageData, this.CACHE_TTL, ['moments'])
    return pageData
  }

  async getRecentMoments(limit: number = 10, userId?: number | null): Promise<MomentDTO[]> {
    const cacheKey = `moments:recent:${limit}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<MomentDTO[]>(cacheKey)
    if (cached) return cached

    const result = await this.momentRepo.list(1, limit, userId)
    await this.cache.set(cacheKey, result.data, this.CACHE_TTL, ['moments'])
    return result.data
  }

  async createMoment(content: string, tags: string[] | null, userId?: number | null, isPublic?: boolean): Promise<{ id: number }> {
    const trimmed = content.trim()
    // v3.1 M3-B3：统一内容策略（长度/敏感词/外链限制）
    const check = checkContent(trimmed, { maxLength: 2000, maxLinks: 0 })
    if (!check.ok) {
      throw new Error(check.reason || '内容不合法')
    }
    const result = await this.momentRepo.create(trimmed, tags, userId, isPublic)
    await this.invalidateCache()
    return result
  }

  async deleteMoment(id: number, userId?: number | null): Promise<void> {
    const existing = await this.momentRepo.findById(id, userId)
    if (!existing) {
      throw new Error('记录不存在')
    }
    await this.momentRepo.delete(id)
    await this.invalidateCache()
  }

  private async invalidateCache(): Promise<void> {
    await this.cache.deleteByTag('moments')
  }
}
