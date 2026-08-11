import { PhotoMessageRepository, PhotoMessageRecord } from '../repositories/photo-message-repository'
import { CacheService } from '../infrastructure/cache'

export interface PhotoMessageDTO {
  id: number
  imageKey: string
  content: string
  createdAt: string
}

const MAX_CONTENT_LENGTH = 500

export class PhotoMessageService {
  private readonly CACHE_TTL = 30

  constructor(
    private readonly repo: PhotoMessageRepository,
    private readonly cache: CacheService,
  ) {}

  /** 每一张照片独立一套聊天记录，按 imageKey 隔离 */
  async getMessages(imageKey: string): Promise<PhotoMessageDTO[]> {
    const key = normalizeKey(imageKey)
    const cacheKey = `photo-msg:${key}`
    const cached = await this.cache.get<PhotoMessageDTO[]>(cacheKey)
    if (cached) return cached

    const messages = await this.repo.listByImage(key, 500)
    await this.cache.set(cacheKey, messages, this.CACHE_TTL, ['photo-msg'])
    return messages
  }

  async addMessage(imageKey: string, content: string): Promise<PhotoMessageDTO> {
    const key = normalizeKey(imageKey)
    const trimmed = content.trim()
    if (!trimmed) throw new Error('留言内容不能为空')
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new Error(`留言过长（最多 ${MAX_CONTENT_LENGTH} 字）`)
    }

    const result = await this.repo.create(key, trimmed)
    await this.cache.deleteByTag('photo-msg')

    return {
      id: result.id,
      imageKey: key,
      content: trimmed,
      createdAt: new Date().toISOString(),
    }
  }
}

function normalizeKey(imageKey: string): string {
  const trimmed = (imageKey || '').trim()
  if (!trimmed) throw new Error('缺少图片标识')
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed
}
