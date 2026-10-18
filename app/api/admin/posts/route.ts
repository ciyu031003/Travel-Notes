import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { isSiteOwner } from '@/lib/site-owner'
import { getPostService } from '@/lib/container'
import { ok, fail, unauthorized } from '@/lib/api-response'
import { validateCreatePost, validateUpdatePost } from '@/lib/validators/post.validator'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || undefined

  try {
    const postService = getPostService()
    const posts = await postService.getAllPosts(type, auth.payload?.userId)
    return ok({ posts })
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
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  // P0：博客文章是站点级公开内容，只允许站点主人创建（此前任何登录用户都能写）
  if (!(await isSiteOwner(auth.payload?.userId))) return fail('当前角色无权执行该操作', 403)

  try {
    const body = await request.json()
    const validation = validateCreatePost(body)
    if (!validation.success) {
      return fail(validation.error.message, 400)
    }

    const postService = getPostService()
    const post = await postService.createPost({
      slug: validation.data.slug,
      title: validation.data.title,
      content: validation.data.content,
      date: new Date(validation.data.date || Date.now()),
      cover: validation.data.cover || undefined,
      images: validation.data.images || [],
      videos: validation.data.videos || [],
      tags: validation.data.tags || [],
      location: validation.data.location || undefined,
      type: validation.data.type || 'travel',
      summary: validation.data.summary || undefined,
      published: validation.data.published ?? true,
      userId: auth.payload?.userId,
      isPublic: validation.data.isPublic ?? false,
    })

    return ok({ post })
  } catch (error: any) {
    console.error('[POST /api/admin/posts] Error:', error?.message)
    return fail(error.message || '创建失败', 500)
  }
}
