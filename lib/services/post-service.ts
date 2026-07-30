import { PostRepository, type FindAllParams, type PaginatedResult, type CreatePostInput, type UpdatePostInput } from '../repositories/post-repository'
import { CacheService } from '../infrastructure/cache'
import { getAllPosts as getMarkdownPosts, getPostBySlug as getMarkdownPost } from '../markdown'
import type { PostMetaDB, PostDB, VideoInfo } from '../db-posts'

const typeMap: Record<string, string> = {
  'travel': 'travel',
  'tech/blog': 'blog',
  'tech/mindmaps': 'mindmap',
  'tech/repos': 'repo',
}

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
  contentHtml: string
}

export class PostService {
  private readonly CACHE_TTL = 300

  constructor(
    private readonly postRepo: PostRepository,
    private readonly cache: CacheService,
  ) {}

  async getPublishedPosts(
    type: string,
    filters: { page?: number; pageSize?: number; search?: string; location?: string }
  ): Promise<PaginatedResult<PostMetaDB>> {
    const cacheKey = `posts:${type}:${JSON.stringify(filters)}`
    const cached = await this.cache.get<PaginatedResult<PostMetaDB>>(cacheKey)
    if (cached) return cached

    const result = await this.postRepo.findAll({
      ...filters,
      type,
      published: true,
    })

    await this.cache.set(cacheKey, result, this.CACHE_TTL, ['posts', `posts:${type}`])
    return result
  }

  async getAllPosts(type?: string): Promise<PostMetaDB[]> {
    const cacheKey = type ? `posts:all:${type}` : 'posts:all'
    const cached = await this.cache.get<PostMetaDB[]>(cacheKey)
    if (cached) return cached

    const posts = type
      ? await this.postRepo.findAllByType(type)
      : (await this.postRepo.findAll({})).data

    await this.cache.set(cacheKey, posts, this.CACHE_TTL, ['posts'])
    return posts
  }

  async getPostBySlug(type: string, slug: string): Promise<PostDetailDTO | null> {
    const cacheKey = `post:${type}:${slug}`
    const cached = await this.cache.get<PostDetailDTO>(cacheKey)
    if (cached) return cached

    const post = await this.postRepo.findBySlug(type, slug)
    if (!post) return null

    const dto = this.toDetailDTO(post)
    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['posts'])
    return dto
  }

  async getPostById(id: number): Promise<PostDetailDTO | null> {
    const cacheKey = `post:id:${id}`
    const cached = await this.cache.get<PostDetailDTO>(cacheKey)
    if (cached) return cached

    const post = await this.postRepo.findById(id)
    if (!post) return null

    const dto = this.toDetailDTO(post)
    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['posts'])
    return dto
  }

  async getPostsByLocation(location: string): Promise<PostMetaDB[]> {
    const cacheKey = `posts:location:${location}`
    const cached = await this.cache.get<PostMetaDB[]>(cacheKey)
    if (cached) return cached

    const posts = await this.postRepo.findByLocation(location)
    await this.cache.set(cacheKey, posts, this.CACHE_TTL, ['posts'])
    return posts
  }

  async getPostCountByType(type: string): Promise<number> {
    const cacheKey = `posts:count:${type}`
    const cached = await this.cache.get<number>(cacheKey)
    if (cached !== null) return cached

    const count = await this.postRepo.countByType(type)
    await this.cache.set(cacheKey, count, this.CACHE_TTL, ['posts'])
    return count
  }

  async getDistinctLocations(): Promise<string[]> {
    const cacheKey = 'posts:locations'
    const cached = await this.cache.get<string[]>(cacheKey)
    if (cached) return cached

    const locations = await this.postRepo.getDistinctLocations()
    await this.cache.set(cacheKey, locations, this.CACHE_TTL, ['posts'])
    return locations
  }

  async getPostsHybrid(directory: string): Promise<PostMetaDB[]> {
    const dbType = typeMap[directory] || directory
    const cacheKey = `posts:hybrid:${directory}`
    const cached = await this.cache.get<PostMetaDB[]>(cacheKey)
    if (cached) return cached

    const allPosts: PostMetaDB[] = []

    try {
      const dbPosts = await this.postRepo.findAllByType(dbType)
      allPosts.push(...dbPosts)
    } catch {}

    try {
      const markdownPosts = getMarkdownPosts(directory)
      const dbSlugs = new Set(allPosts.map(p => p.slug))
      markdownPosts.forEach(mp => {
        if (!dbSlugs.has(mp.slug)) {
          allPosts.push({
            id: 0,
            slug: mp.slug,
            title: mp.title,
            date: mp.date,
            description: mp.description,
            cover: mp.cover,
            images: [],
            videos: [],
            tags: mp.tags || [],
            location: mp.location,
            type: mp.category || directory,
            published: true,
          })
        }
      })
    } catch {}

    allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    await this.cache.set(cacheKey, allPosts, this.CACHE_TTL, ['posts'])
    return allPosts
  }

  async getPostBySlugHybrid(directory: string, slug: string): Promise<PostDetailDTO | null> {
    const dbType = typeMap[directory] || directory
    const cacheKey = `post:hybrid:${directory}:${slug}`
    const cached = await this.cache.get<PostDetailDTO>(cacheKey)
    if (cached) return cached

    try {
      const dbPost = await this.postRepo.findBySlug(dbType, slug)
      if (dbPost) {
        const dto = this.toDetailDTO(dbPost)
        await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['posts'])
        return dto
      }
    } catch {}

    try {
      const mdPost = await getMarkdownPost(directory, slug)
      if (mdPost) {
        return {
          id: 0,
          slug: mdPost.slug,
          title: mdPost.title,
          date: mdPost.date,
          description: mdPost.description,
          cover: mdPost.cover,
          images: [],
          videos: [],
          tags: mdPost.tags || [],
          location: mdPost.location,
          type: mdPost.category || directory,
          published: true,
          contentHtml: mdPost.contentHtml,
        }
      }
    } catch {}

    return null
  }

  async createPost(input: CreatePostInput): Promise<{ id: number }> {
    const result = await this.postRepo.create(input)
    await this.invalidateCache(input.type)
    return result
  }

  async updatePost(id: number, input: UpdatePostInput): Promise<void> {
    await this.postRepo.update(id, input)
    if (input.type) {
      await this.invalidateCache(input.type)
    } else {
      await this.invalidateAllCache()
    }
  }

  async deletePost(id: number): Promise<void> {
    await this.postRepo.delete(id)
    await this.invalidateAllCache()
  }

  private async invalidateCache(type: string): Promise<void> {
    await this.cache.deleteByTag('posts')
    await this.cache.deleteByTag(`posts:${type}`)
  }

  private async invalidateAllCache(): Promise<void> {
    await this.cache.deleteByTag('posts')
  }

  private toDetailDTO(post: PostDB): PostDetailDTO {
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
      contentHtml: post.contentHtml,
    }
  }
}
