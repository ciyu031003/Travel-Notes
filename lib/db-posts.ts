import { prisma } from './db'
import { remark } from 'remark'
import remarkHtml from 'remark-html'
import remarkGfm from 'remark-gfm'

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
  try {
    const post: any = await prisma.post.findFirst({
      where: { type: type as any, slug, published: true },
    })

    if (!post) return null

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
      contentHtml: processedContent.toString(),
    }
  } catch (error: any) {
    console.error('[getDBPostBySlug] Database query failed:', error?.message || error)
    return null
  }
}

export async function getDBPostById(id: number): Promise<PostDB | null> {
  try {
    const post: any = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) return null

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

export const CACHE_EVENTS = {
  POST_CREATED: 'post:created',
  POST_UPDATED: 'post:updated',
  POST_DELETED: 'post:deleted',
  SETTINGS_UPDATED: 'settings:updated',
} as const

export type CacheEvent = typeof CACHE_EVENTS[keyof typeof CACHE_EVENTS]
