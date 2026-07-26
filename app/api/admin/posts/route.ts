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
    const processedPosts = posts.map(post => ({
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
    const post = await createDBPost({
      slug: body.slug,
      title: body.title,
      content: body.content,
      date: new Date(body.date),
      cover: body.cover,
      images: body.images || [],
      tags: body.tags,
      location: body.location,
      type: body.type || 'travel',
      summary: body.summary,
      published: body.published ?? true,
    })
    return NextResponse.json({ post })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 500 })
  }
}
