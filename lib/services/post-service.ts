import { revalidatePath } from 'next/cache'
import { PostRepository, type FindAllParams, type PaginatedResult, type CreatePostInput, type UpdatePostInput, type PostMetaDB, type PostDB, type VideoInfo } from '../repositories/post-repository'
import { syncPublicPostToCircle, unpublishPublicPost } from '../modules/social/travel-post.service'
import { CacheService } from '../infrastructure/cache'
import { MarkdownRenderer, type TocItem } from '../infrastructure/markdown'

export interface PostDTO {
  id: number
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images: string[]
  videos: VideoInfo[]
  tags: string[]
  location?: string
  type: string
  published: boolean
}

export interface PostDetailDTO extends PostDTO {
  content: string
  contentHtml: string
  readMinutes: number
  toc: TocItem[]
}

export class PostService {
  private readonly CACHE_TTL = 300

  constructor(
    private readonly postRepo: PostRepository,
    private readonly cache: CacheService,
    private readonly markdownRenderer?: MarkdownRenderer,
  ) {}

  async getPublishedPosts(
    type: string,
    filters: { page?: number; pageSize?: number; search?: string; location?: string },
    userId?: number | null
  ): Promise<PaginatedResult<PostMetaDB>> {
    const cacheKey = `posts:${type}:${JSON.stringify(filters)}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<PaginatedResult<PostMetaDB>>(cacheKey)
    if (cached) return cached

    const result = await this.postRepo.findAll({
      ...filters,
      type,
      published: true,
      userId,
    })

    await this.cache.set(cacheKey, result, this.CACHE_TTL, ['posts', `posts:${type}`])
    return result
  }

  async getAllPosts(type?: string, userId?: number | null): Promise<PostMetaDB[]> {
    const cacheKey = type ? `posts:all:${type}:u${userId ?? 'anon'}` : `posts:all:u${userId ?? 'anon'}`
    const cached = await this.cache.get<PostMetaDB[]>(cacheKey)
    if (cached) return cached

    const posts = type
      ? await this.postRepo.findAllByType(type, userId)
      : (await this.postRepo.findAll({ userId })).data

    await this.cache.set(cacheKey, posts, this.CACHE_TTL, ['posts'])
    return posts
  }

  async getPostBySlug(type: string, slug: string, userId?: number | null): Promise<PostDetailDTO | null> {
    const cacheKey = `post:${type}:${slug}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<PostDetailDTO>(cacheKey)
    if (cached) return cached

    const post = await this.postRepo.findBySlug(type, slug, userId)
    if (!post) return null

    const dto = await this.toDetailDTO(post)
    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['posts'])
    return dto
  }

  async getPostById(id: number, userId?: number | null): Promise<PostDetailDTO | null> {
    const cacheKey = `post:id:${id}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<PostDetailDTO>(cacheKey)
    if (cached) return cached

    const post = await this.postRepo.findById(id, userId)
    if (!post) return null

    const dto = await this.toDetailDTO(post)
    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['posts'])
    return dto
  }

  async getPostsByLocation(location: string, userId?: number | null): Promise<PostMetaDB[]> {
    const cacheKey = `posts:location:${location}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<PostMetaDB[]>(cacheKey)
    if (cached) return cached

    const posts = await this.postRepo.findByLocation(location, userId)
    await this.cache.set(cacheKey, posts, this.CACHE_TTL, ['posts'])
    return posts
  }

  async getPostCountByType(type: string, userId?: number | null): Promise<number> {
    const cacheKey = `posts:count:${type}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<number>(cacheKey)
    if (cached !== null) return cached

    const count = await this.postRepo.countByType(type, userId)
    await this.cache.set(cacheKey, count, this.CACHE_TTL, ['posts'])
    return count
  }

  async getDistinctLocations(userId?: number | null): Promise<string[]> {
    const cacheKey = `posts:locations:u${userId ?? 'anon'}`
    const cached = await this.cache.get<string[]>(cacheKey)
    if (cached) return cached

    const locations = await this.postRepo.getDistinctLocations(userId)
    await this.cache.set(cacheKey, locations, this.CACHE_TTL, ['posts'])
    return locations
  }

  async getRecentPosts(limit: number = 10, type?: string, userId?: number | null): Promise<PostMetaDB[]> {
    const cacheKey = `posts:recent:${limit}:${type || 'all'}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<PostMetaDB[]>(cacheKey)
    if (cached) return cached

    const result = await this.postRepo.findAll({
      type,
      published: true,
      page: 1,
      pageSize: limit,
      userId,
    })
    const posts = result.data
    await this.cache.set(cacheKey, posts, this.CACHE_TTL, ['posts'])
    return posts
  }

  /** 按 slug 获取内容（DB-only，兼容旧调用名） */
  async getPostBySlugHybrid(type: string, slug: string, userId?: number | null): Promise<PostDetailDTO | null> {
    return this.getPostBySlug(type, slug, userId)
  }

  /** 获取某类内容（当前为旅行记录），DB-only（旧 content/ 兼容层已移除） */
  async getPostsHybrid(type: string, userId?: number | null): Promise<PostMetaDB[]> {
    const cacheKey = `posts:hybrid:${type}:u${userId ?? 'anon'}`
    const cached = await this.cache.get<PostMetaDB[]>(cacheKey)
    if (cached) return cached

    const posts = await this.postRepo.findAllByType(type, userId)
    await this.cache.set(cacheKey, posts, this.CACHE_TTL, ['posts', `posts:${type}`])
    return posts
  }

  /** 全站搜索（当前以旅行记录为主，返回最近 50 条） */
  async searchAllPosts(keyword: string, userId?: number | null): Promise<PostMetaDB[]> {
    const posts = await this.postRepo.search(keyword, 'travel', userId)
    return posts.slice(0, 50)
  }

  async createPost(input: CreatePostInput): Promise<{ id: number }> {
    const result = await this.postRepo.create(input)
    await syncPublicPostToCircle(result.id).catch(() => {})
    await this.invalidateCache(input.type)
    this.invalidateIsrCache()
    return result
  }

  async updatePost(id: number, input: UpdatePostInput): Promise<void> {
    await this.postRepo.update(id, input)
    await syncPublicPostToCircle(id).catch(() => {})
    if (input.type) {
      await this.invalidateCache(input.type)
    } else {
      await this.invalidateAllCache()
    }
    this.invalidateIsrCache()
  }

  async deletePost(id: number): Promise<void> {
    await this.postRepo.delete(id)
    await unpublishPublicPost(id).catch(() => {})
    await this.invalidateAllCache()
    this.invalidateIsrCache()
  }

  private async invalidateCache(type: string): Promise<void> {
    await this.cache.deleteByTag('posts')
    await this.cache.deleteByTag(`posts:${type}`)
  }

  private async invalidateAllCache(): Promise<void> {
    await this.cache.deleteByTag('posts')
  }

  /** 内容变更后失效 Next.js ISR 缓存，使前台页面尽快反映最新内容。 */
  private invalidateIsrCache(): void {
    try {
      revalidatePath('/')
      revalidatePath('/travel')
      revalidatePath('/album')
      revalidatePath('/travel/[slug]', 'page')
    } catch {
      // 构建期或无权调用时忽略，ISR 到期后会自动重新生成
    }
  }

  private async toDetailDTO(post: PostDB): Promise<PostDetailDTO> {
    let contentHtml = post.contentHtml
    let readMinutes = 1
    let toc: TocItem[] = []

    if (this.markdownRenderer) {
      try {
        const rendered = await this.markdownRenderer.render(post.content, { extractToc: true })
        contentHtml = rendered.html
        readMinutes = rendered.readMinutes
        toc = rendered.toc
      } catch {
      }
    }

    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      date: post.date,
      description: post.description,
      cover: post.cover,
      images: post.images ?? [],
      videos: post.videos ?? [],
      tags: post.tags ?? [],
      location: post.location,
      type: post.type,
      published: post.published,
      content: post.content,
      contentHtml,
      readMinutes,
      toc,
    }
  }
}
