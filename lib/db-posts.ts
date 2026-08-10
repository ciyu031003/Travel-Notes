import { prisma } from './db'
import { remark } from 'remark'
import remarkHtml from 'remark-html'
import remarkGfm from 'remark-gfm'
/**
 * 低内存构建优化：构建阶段（next build）跳过数据库读取。
 * 由部署脚本设置 SKIP_DB_ON_BUILD=1；构建期返回空数据，页面预渲染为轻量壳，
 * 运行时由 ISR（revalidate=300）按需生成真实内容，显著降低 2C2G 服务器构建内存峰值。
 */
function skipDbOnBuild(): boolean {
  return process.env.SKIP_DB_ON_BUILD === '1' && process.env.NEXT_PHASE === 'phase-production-build'
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

export interface PostListOptions {
  type: string
  page?: number
  pageSize?: number
  includeContent?: boolean
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

function serializeTags(tags: string[]): string {
  return JSON.stringify(tags)
}

function parseImages(images: string | null | undefined): string[] {
  if (!images) return []
  try {
    const parsed = JSON.parse(images)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => {
      if (typeof item === 'number') {
        return `/api/images/${item}`
      }
      return String(item)
    })
  } catch {
    return []
  }
}

function serializeImages(images: string[]): string {
  return JSON.stringify(images)
}

function parseVideos(videos: string | null | undefined): VideoInfo[] {
  if (!videos) return []
  try {
    const parsed = JSON.parse(videos)
    if (Array.isArray(parsed)) {
      return parsed.map((v: any) => {
        if (typeof v === 'string') {
          return { url: v }
        }
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

function serializeVideos(videos: VideoInfo[]): string {
  return JSON.stringify(videos)
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

function ensureDate(date: any): Date {
  if (date instanceof Date) return date
  if (typeof date === 'string') {
    const d = new Date(date)
    if (!isNaN(d.getTime())) return d
  }
  if (typeof date === 'number') {
    return new Date(date)
  }
  return new Date()
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

function toImageUrl(value: string | number | null | undefined): string | undefined {
  if (!value) return undefined
  if (typeof value === 'number') return `/api/images/${value}`
  const str = String(value)
  if (/^\d+$/.test(str)) return `/api/images/${str}`
  return str
}

function mapPostMeta(post: any): PostMetaDB {
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

export async function getDBPosts(type: string, includeContent: boolean = false): Promise<PostMetaDB[]> {
  if (skipDbOnBuild()) {
    return []
  }
  try {
    const select = includeContent ? fullSelect : metaSelect
    const posts = await prisma.post.findMany({
      where: { type: type as any, published: true },
      orderBy: { date: 'desc' },
      select,
    })

    return posts.map(mapPostMeta)
  } catch (error: any) {
    console.error('[getDBPosts] Database query failed:', error?.message || error)
    return []
  }
}
export async function getDBPostsWithPagination(
  type: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ posts: PostMetaDB[]; total: number; hasMore: boolean }> {
  if (skipDbOnBuild()) {
    return { posts: [], total: 0, hasMore: false }
  }
  try {
    const skip = (page - 1) * pageSize
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { type: type as any, published: true },
        orderBy: { date: 'desc' },
        select: metaSelect,
        skip,
        take: pageSize,
      }),
      prisma.post.count({
        where: { type: type as any, published: true },
      }),
    ])

    return {
      posts: posts.map(mapPostMeta),
      total,
      hasMore: skip + posts.length < total,
    }
  } catch (error: any) {
    console.error('[getDBPostsWithPagination] Database query failed:', error?.message || error)
    return { posts: [], total: 0, hasMore: false }
  }
}

export async function getDBPostBySlug(type: string, slug: string): Promise<PostDB | null> {
  if (skipDbOnBuild()) {
    return null
  }
  try {
    const post: any = await prisma.post.findFirst({
      where: { type: type as any, slug, published: true },
    })

    if (!post) return null

    // 待后续全量迁移到 MarkdownRenderer（当前保留避免破坏混合内容获取回退链路）
    const processedContent = await remark()
      .use(remarkGfm)
      .use(remarkHtml, { sanitize: false })
      .process(post.content || '')

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
      content: post.content || '',
      contentHtml: processedContent.toString(),
    }
  } catch (error: any) {
    console.error('[getDBPostBySlug] Database query failed:', error?.message || error)
    return null
  }
}

export async function getDBPostById(id: number): Promise<PostDB | null> {
  if (skipDbOnBuild()) {
    return null
  }
  try {
    const post: any = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) return null

    // 待后续全量迁移到 MarkdownRenderer（当前保留避免破坏混合内容获取回退链路）
    const processedContent = await remark()
      .use(remarkGfm)
      .use(remarkHtml, { sanitize: false })
      .process(post.content || '')

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
      content: post.content || '',
      contentHtml: processedContent.toString(),
    }
  } catch (error: any) {
    console.error('[getDBPostById] Database query failed:', error?.message || error)
    return null
  }
}

export async function createDBPost(data: {
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
}) {
  return prisma.post.create({
    data: {
      slug: data.slug,
      title: data.title,
      content: data.content,
      date: ensureDate(data.date),
      cover: data.cover || null,
      images: serializeImages(data.images || []),
      videos: serializeVideos(data.videos || []),
      tags: serializeTags(data.tags || []),
      location: data.location || null,
      type: data.type as any,
      summary: data.summary || null,
      published: data.published ?? true,
    },
  })
}

export async function updateDBPost(id: number, data: Partial<{
  slug: string
  title: string
  content: string
  date: Date
  cover: string
  images: string[]
  videos: VideoInfo[]
  tags: string[]
  location: string
  type: string
  summary: string
  published: boolean
}>) {
  const updateData: any = {}
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.title !== undefined) updateData.title = data.title
  if (data.content !== undefined) updateData.content = data.content
  if (data.date !== undefined) updateData.date = ensureDate(data.date)
  if (data.cover !== undefined) updateData.cover = data.cover
  if (data.images !== undefined) updateData.images = serializeImages(data.images)
  if (data.videos !== undefined) updateData.videos = serializeVideos(data.videos)
  if (data.tags !== undefined) updateData.tags = serializeTags(data.tags)
  if (data.location !== undefined) updateData.location = data.location
  if (data.type !== undefined) updateData.type = data.type
  if (data.summary !== undefined) updateData.summary = data.summary
  if (data.published !== undefined) updateData.published = data.published

  return prisma.post.update({
    where: { id },
    data: updateData,
  })
}

export async function deleteDBPost(id: number) {
  return prisma.post.delete({
    where: { id },
  })
}

export async function getAllDBPosts(type?: string) {
  if (skipDbOnBuild()) {
    return []
  }
  try {
    const where = type ? { type: type as any } : {}
    return await prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: metaSelect,
    })
  } catch (error: any) {
    console.error('[getAllDBPosts] Database query failed:', error?.message || error)
    return []
  }
}

export async function getPostsByLocation(location: string): Promise<PostMetaDB[]> {
  if (skipDbOnBuild()) {
    return []
  }
  try {
    const posts = await prisma.post.findMany({
      where: {
        location: { contains: location },
        published: true,
      },
      orderBy: { date: 'desc' },
      select: metaSelect,
    })
    return posts.map(mapPostMeta)
  } catch (error: any) {
    console.error('[getPostsByLocation] Database query failed:', error?.message || error)
    return []
  }
}

export async function getPostCountByType(type: string): Promise<number> {
  if (skipDbOnBuild()) {
    return 0
  }
  try {
    return await prisma.post.count({
      where: { type: type as any, published: true },
    })
  } catch (error: any) {
    console.error('[getPostCountByType] Database query failed:', error?.message || error)
    return 0
  }
}

export async function getDistinctLocations(): Promise<string[]> {
  if (skipDbOnBuild()) {
    return []
  }
  try {
    const posts = await prisma.post.findMany({
      where: { published: true, location: { not: null } },
      select: { location: true },
      distinct: ['location'],
    })
    return posts.map((p: any) => p.location).filter(Boolean)
  } catch (error: any) {
    console.error('[getDistinctLocations] Database query failed:', error?.message || error)
    return []
  }
}

export async function getAdjacentPosts(
  type: string,
  date: string
): Promise<{ prev: PostMetaDB | null; next: PostMetaDB | null }> {
  if (skipDbOnBuild()) {
    return { prev: null, next: null }
  }
  try {
    const dateObj = ensureDate(date)
    const [prevPost, nextPost] = await Promise.all([
      prisma.post.findFirst({
        where: {
          type: type as any,
          published: true,
          date: { lt: dateObj },
        },
        orderBy: { date: 'desc' },
        take: 1,
        select: metaSelect,
      }),
      prisma.post.findFirst({
        where: {
          type: type as any,
          published: true,
          date: { gt: dateObj },
        },
        orderBy: { date: 'asc' },
        take: 1,
        select: metaSelect,
      }),
    ])

    return {
      prev: prevPost ? mapPostMeta(prevPost) : null,
      next: nextPost ? mapPostMeta(nextPost) : null,
    }
  } catch (error: any) {
    console.error('[getAdjacentPosts] Database query failed:', error?.message || error)
    return { prev: null, next: null }
  }
}

export async function getPostsByTag(tag: string, type?: string): Promise<PostMetaDB[]> {
  if (skipDbOnBuild()) {
    return []
  }
  try {
    const where: any = {
      published: true,
      tags: { contains: tag },
    }
    if (type) {
      where.type = type as any
    }
    const posts = await prisma.post.findMany({
      where,
      orderBy: { date: 'desc' },
      select: metaSelect,
    })
    const mapped = posts.map(mapPostMeta)
    return mapped.filter((p) => Array.isArray(p.tags) && p.tags.includes(tag))
  } catch (error: any) {
    console.error('[getPostsByTag] Database query failed:', error?.message || error)
    return []
  }
}

export async function getAllTags(type?: string): Promise<Array<{ name: string; count: number }>> {
  if (skipDbOnBuild()) {
    return []
  }
  try {
    const where: any = { published: true }
    if (type) {
      where.type = type as any
    }
    const posts = await prisma.post.findMany({
      where,
      select: { tags: true },
    })
    const counts = new Map<string, number>()
    for (const post of posts) {
      const tags = parseTags(post.tags)
      for (const t of tags) {
        counts.set(t, (counts.get(t) || 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  } catch (error: any) {
    console.error('[getAllTags] Database query failed:', error?.message || error)
    return []
  }
}

export async function searchPosts(keyword: string, type?: string): Promise<PostMetaDB[]> {
  if (skipDbOnBuild()) {
    return []
  }
  try {
    const where: any = {
      published: true,
      OR: [
        { title: { contains: keyword } },
        { summary: { contains: keyword } },
        { content: { contains: keyword } },
      ],
    }
    if (type) {
      where.type = type as any
    }
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
  } catch (error: any) {
    console.error('[searchPosts] Database query failed:', error?.message || error)
    return []
  }
}

export const CACHE_EVENTS = {
  POST_CREATED: 'post:created',
  POST_UPDATED: 'post:updated',
  POST_DELETED: 'post:deleted',
  SETTINGS_UPDATED: 'settings:updated',
} as const

export type CacheEvent = typeof CACHE_EVENTS[keyof typeof CACHE_EVENTS]
