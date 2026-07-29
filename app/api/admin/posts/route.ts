import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getAllDBPosts, createDBPost } from '@/lib/db-posts'
import { ok, fail, unauthorized } from '@/lib/api-response'
import { clearAllPostCache, clearPostCacheByType } from '@/lib/content'

function parseImages(images: string | null): string[] {
  if (!images) return []
  try {
    const parsed = JSON.parse(images)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseTags(tags: string | null): string[] {
  if (!tags) return []
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseVideos(videos: string | null): Array<{ url: string; thumbnail?: string; duration?: number }> {
  if (!videos) return []
  try {
    const parsed = JSON.parse(videos)
    if (!Array.isArray(parsed)) return []
    return parsed.map((v: any) => {
      if (typeof v === 'string') return { url: v }
      return { url: v.url, thumbnail: v.thumbnail, duration: v.duration }
    })
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || undefined

  try {
    const posts = await getAllDBPosts(type)
    const processedPosts = posts.map((post: any) => ({
      ...post,
      images: parseImages(post.images),
      videos: parseVideos(post.videos),
      tags: parseTags(post.tags),
    }))
    return ok({ posts: processedPosts })
  } catch (error: any) {
    console.error('[GET /api/admin/posts] Error:', error?.message)
    return ok({ posts: [] })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  try {
    const body = await request.json()
    console.log('[POST /api/admin/posts] Received data:', {
      slug: body.slug,
      title: body.title,
      contentLength: body.content?.length,
      date: body.date,
      cover: body.cover,
      imagesCount: body.images?.length,
      videosCount: body.videos?.length,
      tags: body.tags,
      location: body.location,
      type: body.type,
      summaryLength: body.summary?.length,
      published: body.published,
    })

    const post = await createDBPost({
      slug: body.slug,
      title: body.title,
      content: body.content || '',
      date: new Date(body.date),
      cover: body.cover || undefined,
      images: body.images || [],
      videos: body.videos || [],
      tags: body.tags || [],
      location: body.location || undefined,
      type: body.type || 'travel',
      summary: body.summary || undefined,
      published: body.published ?? true,
    })

    clearPostCacheByType(body.type || 'travel')

    console.log('[POST /api/admin/posts] Created post with id:', post.id)
    return ok({ post })
  } catch (error: any) {
    console.error('[POST /api/admin/posts] Error:', error?.message, error?.code)
    return fail(error.message || '创建失败', 500)
  }
}
