import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getAllDBPosts, createDBPost } from '@/lib/db-posts'

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || undefined

  try {
    const posts = await getAllDBPosts(type)
    const processedPosts = posts.map((post: any) => ({
      ...post,
      images: parseImages(post.images),
      tags: parseTags(post.tags),
    }))
    return NextResponse.json({ posts: processedPosts })
  } catch {
    return NextResponse.json({ posts: [] })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
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
      tags: body.tags || [],
      location: body.location || undefined,
      type: body.type || 'travel',
      summary: body.summary || undefined,
      published: body.published ?? true,
    })
    console.log('[POST /api/admin/posts] Created post with id:', post.id)
    return NextResponse.json({ post })
  } catch (error: any) {
    console.error('[POST /api/admin/posts] Error:', error?.message, error?.code, error?.stack)
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 500 })
  }
}
