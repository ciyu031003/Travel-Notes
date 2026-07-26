import { prisma } from './db'
import matter from 'gray-matter'
import { remark } from 'remark'
import remarkHtml from 'remark-html'
import remarkGfm from 'remark-gfm'

export interface PostMetaDB {
  id: number
  slug: string
  title: string
  date: string
  description?: string
  cover?: string | null
  images?: string[]
  tags?: string[]
  location?: string | null
  type: string
  published: boolean
}

export interface PostDB extends PostMetaDB {
  contentHtml: string
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
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function serializeImages(images: string[]): string {
  return JSON.stringify(images)
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

export async function getDBPosts(type: string): Promise<PostMetaDB[]> {
  try {
    const posts = await prisma.post.findMany({
      where: { type: type as any, published: true },
      orderBy: { date: 'desc' },
    })

    return posts.map(post => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      date: toISOString(post.date),
      description: post.summary || undefined,
      cover: post.cover || undefined,
      images: parseImages(post.images),
      tags: parseTags(post.tags),
      location: post.location || undefined,
      type: post.type,
      published: post.published,
    }))
  } catch (error: any) {
    console.error('[getDBPosts] Database query failed:', error?.message || error)
    return []
  }
}

export async function getDBPostBySlug(type: string, slug: string): Promise<PostDB | null> {
  try {
    const post = await prisma.post.findFirst({
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
      cover: post.cover || undefined,
      images: parseImages(post.images),
      tags: parseTags(post.tags),
      location: post.location || undefined,
      type: post.type,
      published: post.published,
      contentHtml: processedContent.toString(),
    }
  } catch (error: any) {
    console.error('[getDBPostBySlug] Database query failed:', error?.message || error)
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
      date: data.date,
      cover: data.cover || null,
      images: serializeImages(data.images || []),
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
  if (data.date !== undefined) updateData.date = data.date
  if (data.cover !== undefined) updateData.cover = data.cover
  if (data.images !== undefined) updateData.images = serializeImages(data.images)
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
    })
  } catch (error: any) {
    console.error('[getAllDBPosts] Database query failed:', error?.message || error)
    return []
  }
}
