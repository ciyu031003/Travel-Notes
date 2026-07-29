import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { updateDBPost, deleteDBPost } from '@/lib/db-posts'
import { ok, fail, notFound, unauthorized } from '@/lib/api-response'
import { clearPostCacheBySlug } from '@/lib/content'

function parseImages(images: string | null): string[] {
  if (!images) return []
  try {
    const parsed = JSON.parse(images)
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const post = await prisma.post.findUnique({ where: { id: parseInt(id) } })
    if (!post) {
      return notFound('文章不存在')
    }
    const postData = {
      ...post,
      images: parseImages(post.images),
      videos: parseVideos(post.videos),
    }
    return ok({ post: postData })
  } catch (error: any) {
    console.error('[GET /api/admin/posts/:id] Error:', error?.message)
    return fail('获取失败', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  const { id } = await params
  try {
    const body = await request.json()
    const post = await prisma.post.findUnique({ where: { id: parseInt(id) } })
    const result = await updateDBPost(parseInt(id), body)

    if (post) {
      clearPostCacheBySlug(post.type, post.slug)
    }

    return ok({ post: result })
  } catch (error: any) {
    console.error('[PUT /api/admin/posts/:id] Error:', error?.message)
    return fail(error.message || '更新失败', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  const { id } = await params
  try {
    const post = await prisma.post.findUnique({ where: { id: parseInt(id) } })
    await deleteDBPost(parseInt(id))

    if (post) {
      clearPostCacheBySlug(post.type, post.slug)
    }

    return ok({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/admin/posts/:id] Error:', error?.message)
    return fail(error.message || '删除失败', 500)
  }
}
