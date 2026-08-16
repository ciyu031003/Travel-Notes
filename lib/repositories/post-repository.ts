import { prisma } from '../db'

/**
 * 低内存构建优化：构建阶段（next build）跳过数据库读取。
 * 部署脚本设置 SKIP_DB_ON_BUILD=1 时，构建期返回空数据（轻量壳），
 * 运行时由 ISR 按需生成真实内容，降低 2C2G 服务器构建内存峰值与耗时。
 */
function skipDbOnBuild(): boolean {
  return process.env.SKIP_DB_ON_BUILD === '1'
}

export interface VideoInfo {
  url: string
  thumbnail?: string
  duration?: number
  width?: number
  height?: number
}

export interface PostMetaDB {
  id: number
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  videos?: VideoInfo[]
  tags?: string[]
  location?: string
  type: string
  published: boolean
}

export interface PostDB extends PostMetaDB {
  content: string
  contentHtml: string
}

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

function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return []
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseImages(images: string | null | undefined): string[] {
  if (!images) return []
  try {
    const parsed = JSON.parse(images)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item: any) => {
      if (typeof item === 'number') return `/api/images/${item}`
      return String(item)
    })
  } catch {
    return []
  }
}

function parseVideos(videos: string | null | undefined): VideoInfo[] {
  if (!videos) return []
  try {
    const parsed = JSON.parse(videos)
    if (Array.isArray(parsed)) {
      return parsed.map((v: any) => {
        if (typeof v === 'string') return { url: v }
        return {
          url: v.url,
          thumbnail: v.thumbnail,
          duration: v.duration,
          width: v.width,
          height: v.height,
        }
      })
    }
    return []
  } catch {
    return []
  }
}

function toImageUrl(value: string | number | null | undefined): string | undefined {
  if (!value) return undefined
  if (typeof value === 'number') return `/api/images/${value}`
  const str = String(value)
  if (/^\d+$/.test(str)) return `/api/images/${str}`
  return str
}

function toISOString(date: any): string {
  if (date instanceof Date) return date.toISOString()
  if (typeof date === 'string') {
    const d = new Date(date)
    if (!isNaN(d.getTime())) return d.toISOString()
    return date
  }
  return new Date().toISOString()
}

export function mapPostMeta(post: any): PostMetaDB {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: toISOString(post.date),
    description: post.summary || undefined,
    cover: toImageUrl(post.cover),
    images: parseImages(post.images),
    videos: parseVideos(post.videos),
    tags: parseTags(post.tags),
    location: post.location || undefined,
    type: post.type as string,
    published: post.published,
  }
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
  findAdjacent(type: string, date: string): Promise<{ prev: PostMetaDB | null; next: PostMetaDB | null }>
  findByTag(tag: string, type?: string): Promise<PostMetaDB[]>
  getAllTags(type?: string): Promise<Array<{ name: string; count: number }>>
  search(keyword: string, type?: string): Promise<PostMetaDB[]>
}

const metaSelect = {
  id: true,
  slug: true,
  title: true,
  date: true,
  cover: true,
  images: true,
  videos: true,
  tags: true,
  location: true,
  type: true,
  summary: true,
  published: true,
  createdAt: true,
  updatedAt: true,
}

const fullSelect = {
  ...metaSelect,
  content: true,
}

export class PrismaPostRepository implements PostRepository {
  async findById(id: number): Promise<PostDB | null> {
    if (skipDbOnBuild()) return null
    const post = await prisma.post.findUnique({ where: { id }, select: fullSelect })
    if (!post) return null
    return this.toPostDB(post)
  }

  async findBySlug(type: string, slug: string): Promise<PostDB | null> {
    if (skipDbOnBuild()) return null
    const post = await prisma.post.findUnique({
      where: { type_slug: { type, slug } },
      select: fullSelect,
    })
    if (!post) return null
    return this.toPostDB(post)
  }

  async findAll(params: FindAllParams): Promise<PaginatedResult<PostMetaDB>> {
    if (skipDbOnBuild()) {
      return { data: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 20, hasMore: false }
    }
    const { type, published, page = 1, pageSize = 20, search, location } = params
    const where: any = {}
    if (type) where.type = type
    if (published !== undefined) where.published = published
    if (location) where.location = location
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } },
        { content: { contains: search } },
      ]
    }

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: metaSelect,
      }),
    ])

    return {
      data: posts.map(mapPostMeta),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }

  async findAllByType(type: string): Promise<PostMetaDB[]> {
    if (skipDbOnBuild()) return []
    const posts = await prisma.post.findMany({
      where: { type, published: true },
      orderBy: { date: 'desc' },
      select: metaSelect,
    })
    return posts.map(mapPostMeta)
  }

  async findByLocation(location: string): Promise<PostMetaDB[]> {
    if (skipDbOnBuild()) return []
    const posts = await prisma.post.findMany({
      where: { location, published: true },
      orderBy: { date: 'desc' },
      select: metaSelect,
    })
    return posts.map(mapPostMeta)
  }

  async create(data: CreatePostInput): Promise<{ id: number }> {
    const post = await prisma.post.create({
      data: {
        slug: data.slug,
        title: data.title,
        content: data.content,
        date: data.date,
        cover: data.cover ?? null,
        images: data.images && data.images.length > 0 ? JSON.stringify(data.images) : null,
        videos: data.videos && data.videos.length > 0 ? JSON.stringify(data.videos) : null,
        tags: data.tags && data.tags.length > 0 ? JSON.stringify(data.tags) : null,
        location: data.location ?? null,
        type: data.type,
        summary: data.summary ?? null,
        published: data.published ?? true,
      },
    })
    return { id: post.id }
  }

  async update(id: number, data: UpdatePostInput): Promise<void> {
    const updateData: any = {}
    if (data.slug !== undefined) updateData.slug = data.slug
    if (data.title !== undefined) updateData.title = data.title
    if (data.content !== undefined) updateData.content = data.content
    if (data.date !== undefined) updateData.date = data.date instanceof Date ? data.date : new Date(data.date)
    if (data.cover !== undefined) updateData.cover = data.cover || null
    if (data.images !== undefined) updateData.images = data.images.length > 0 ? JSON.stringify(data.images) : null
    if (data.videos !== undefined) updateData.videos = data.videos.length > 0 ? JSON.stringify(data.videos) : null
    if (data.tags !== undefined) updateData.tags = data.tags.length > 0 ? JSON.stringify(data.tags) : null
    if (data.location !== undefined) updateData.location = data.location || null
    if (data.type !== undefined) updateData.type = data.type
    if (data.summary !== undefined) updateData.summary = data.summary || null
    if (data.published !== undefined) updateData.published = data.published

    await prisma.post.update({ where: { id }, data: updateData })
  }

  async delete(id: number): Promise<void> {
    await prisma.post.delete({ where: { id } })
  }

  async countByType(type: string): Promise<number> {
    if (skipDbOnBuild()) return 0
    return prisma.post.count({ where: { type, published: true } })
  }

  async getDistinctLocations(): Promise<string[]> {
    if (skipDbOnBuild()) return []
    const rows = await prisma.post.findMany({
      where: { published: true, location: { not: null } },
      select: { location: true },
      distinct: ['location'],
    })
    return rows.map((r) => r.location as string).filter(Boolean)
  }

  async findAdjacent(
    type: string,
    date: string
  ): Promise<{ prev: PostMetaDB | null; next: PostMetaDB | null }> {
    if (skipDbOnBuild()) return { prev: null, next: null }
    const target = new Date(date)
    const [prevPost, nextPost] = await Promise.all([
      prisma.post.findFirst({
        where: { type, published: true, date: { lt: target } },
        orderBy: { date: 'desc' },
        select: metaSelect,
      }),
      prisma.post.findFirst({
        where: { type, published: true, date: { gt: target } },
        orderBy: { date: 'asc' },
        select: metaSelect,
      }),
    ])
    return {
      prev: prevPost ? mapPostMeta(prevPost) : null,
      next: nextPost ? mapPostMeta(nextPost) : null,
    }
  }

  async findByTag(tag: string, type?: string): Promise<PostMetaDB[]> {
    if (skipDbOnBuild()) return []
    const where: any = {
      published: true,
      tags: { contains: tag },
    }
    if (type) where.type = type
    const posts = await prisma.post.findMany({
      where,
      orderBy: { date: 'desc' },
      select: metaSelect,
    })
    const mapped = posts.map(mapPostMeta)
    return mapped.filter((p) => Array.isArray(p.tags) && p.tags.includes(tag))
  }

  async getAllTags(type?: string): Promise<Array<{ name: string; count: number }>> {
    if (skipDbOnBuild()) return []
    const where: any = { published: true }
    if (type) where.type = type
    const posts = await prisma.post.findMany({ where, select: { tags: true } })
    const counts = new Map<string, number>()
    for (const post of posts) {
      for (const t of parseTags(post.tags)) {
        counts.set(t, (counts.get(t) || 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  async search(keyword: string, type?: string): Promise<PostMetaDB[]> {
    if (skipDbOnBuild()) return []
    const where: any = {
      published: true,
      OR: [
        { title: { contains: keyword } },
        { summary: { contains: keyword } },
        { content: { contains: keyword } },
      ],
    }
    if (type) where.type = type
    const posts = await prisma.post.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 50,
      select: metaSelect,
    })
    const mapped = posts.map(mapPostMeta)
    const kw = keyword.toLowerCase()
    mapped.sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase().includes(kw) ? 1 : 0
      const bTitle = (b.title || '').toLowerCase().includes(kw) ? 1 : 0
      if (aTitle !== bTitle) return bTitle - aTitle
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
    return mapped
  }

  private toPostDB(post: any): PostDB {
    return {
      ...mapPostMeta(post),
      content: post.content,
      contentHtml: '',
    }
  }
}

export const prismaPostRepository = new PrismaPostRepository()
