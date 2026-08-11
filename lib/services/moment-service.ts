import { MomentRepository, MomentRecord } from '../repositories/moment-repository'
import { CacheService } from '../infrastructure/cache'

export interface MomentDTO {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
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

  async getMoments(page: number = 1, pageSize: number = 20): Promise<MomentPage> {
    const cacheKey = `moments:${page}:${pageSize}`
    const cached = await this.cache.get<MomentPage>(cacheKey)
    if (cached) return cached

    const result = await this.momentRepo.list(page, pageSize)
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

  async getRecentMoments(limit: number = 10): Promise<MomentDTO[]> {
    const cacheKey = `moments:recent:${limit}`
    const cached = await this.cache.get<MomentDTO[]>(cacheKey)
    if (cached) return cached

    const result = await this.momentRepo.list(1, limit)
    await this.cache.set(cacheKey, result.data, this.CACHE_TTL, ['moments'])
    return result.data
  }

  async createMoment(content: string, tags: string[] | null): Promise<{ id: number }> {
    const trimmed = content.trim()
    if (!trimmed) {
      throw new Error('内容不能为空')
    }
    const result = await this.momentRepo.create(trimmed, tags)
    await this.invalidateCache()
    return result
  }

  async deleteMoment(id: number): Promise<void> {
    const existing = await this.momentRepo.findById(id)
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
