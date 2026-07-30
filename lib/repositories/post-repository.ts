import { prisma } from '../db'
import {
  getDBPosts,
  getDBPostsWithPagination,
  getDBPostBySlug,
  getDBPostById,
  createDBPost,
  updateDBPost,
  deleteDBPost,
  getAllDBPosts,
  getPostsByLocation,
  getPostCountByType,
  getDistinctLocations,
  type VideoInfo,
  type PostMetaDB,
  type PostDB,
} from '../db-posts'

export interface FindAllParams {
  type?: string
  published?: boolean
  page?: number
  pageSize?: number
  search?: string
  location?: string
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface CreatePostInput {
  slug: string
  title: string
  content: string
  date: Date
  cover?: string
  images?: string[]
  videos?: VideoInfo[]
  tags?: string[]
  location?: string
  type: string
  summary?: string
  published?: boolean
}

export interface UpdatePostInput {
  slug?: string
  title?: string
  content?: string
  date?: Date | string
  cover?: string
  images?: string[]
  videos?: VideoInfo[]
  tags?: string[]
  location?: string
  type?: string
  summary?: string
  published?: boolean
}

export interface PostRepository {
  findById(id: number): Promise<PostDB | null>
  findBySlug(type: string, slug: string): Promise<PostDB | null>
  findAll(params: FindAllParams): Promise<PaginatedResult<PostMetaDB>>
  findAllByType(type: string): Promise<PostMetaDB[]>
  findByLocation(location: string): Promise<PostMetaDB[]>
  create(data: CreatePostInput): Promise<{ id: number }>
  update(id: number, data: UpdatePostInput): Promise<void>
  delete(id: number): Promise<void>
  countByType(type: string): Promise<number>
  getDistinctLocations(): Promise<string[]>
}

export class PrismaPostRepository implements PostRepository {
  async findById(id: number): Promise<PostDB | null> {
    return getDBPostById(id)
  }

  async findBySlug(type: string, slug: string): Promise<PostDB | null> {
    return getDBPostBySlug(type, slug)
  }

  async findAll(params: FindAllParams): Promise<PaginatedResult<PostMetaDB>> {
    const { type, page = 1, pageSize = 20 } = params
    if (type) {
      const result = await getDBPostsWithPagination(type, page, pageSize)
      return {
        data: result.posts,
        total: result.total,
        page,
        pageSize,
        hasMore: result.hasMore,
      }
    }
    const allPosts = await getAllDBPosts()
    const total = allPosts.length
    const skip = (page - 1) * pageSize
    const pagedPosts = allPosts.slice(skip, skip + pageSize)
    return {
      data: pagedPosts.map(this.mapToMeta),
      total,
      page,
      pageSize,
      hasMore: skip + pagedPosts.length < total,
    }
  }

  async findAllByType(type: string): Promise<PostMetaDB[]> {
    return getDBPosts(type)
  }

  async findByLocation(location: string): Promise<PostMetaDB[]> {
    return getPostsByLocation(location)
  }

  async create(data: CreatePostInput): Promise<{ id: number }> {
    const post = await createDBPost(data)
    return { id: post.id }
  }

  async update(id: number, data: UpdatePostInput): Promise<void> {
    const updateData: any = { ...data }
    if (typeof updateData.date === 'string') {
      updateData.date = new Date(updateData.date)
    }
    await updateDBPost(id, updateData)
  }

  async delete(id: number): Promise<void> {
    await deleteDBPost(id)
  }

  async countByType(type: string): Promise<number> {
    return getPostCountByType(type)
  }

  async getDistinctLocations(): Promise<string[]> {
    return getDistinctLocations()
  }

  private mapToMeta(post: any): PostMetaDB {
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      date: post.date instanceof Date ? post.date.toISOString() : String(post.date),
      description: post.summary || undefined,
      cover: post.cover || undefined,
      images: [],
      videos: [],
      tags: [],
      location: post.location || undefined,
      type: post.type as string,
      published: post.published,
    }
  }
}

export const prismaPostRepository = new PrismaPostRepository()
