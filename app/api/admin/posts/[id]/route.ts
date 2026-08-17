import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getPostService } from '@/lib/container'
import { ok, fail, notFound, unauthorized } from '@/lib/api-response'
import { validateUpdatePost } from '@/lib/validators/post.validator'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }
  const { id } = await params
  try {
    const postService = getPostService()
    const post = await postService.getPostById(parseInt(id), auth.payload?.userId)
    if (!post) {
      return notFound('文章不存在')
    }
    return ok({ post })
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
    const validation = validateUpdatePost(body)
    if (!validation.success) {
      return fail(validation.error.message, 400)
    }

    const postService = getPostService()
    await postService.updatePost(parseInt(id), {
      ...validation.data,
      isPublic: validation.data.isPublic,
    })

    return ok({ success: true })
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
    const postService = getPostService()
    // 仅允许删除自己名下的文章
    const owned = await postService.getPostById(parseInt(id), auth.payload?.userId)
    if (!owned) {
      return notFound('文章不存在或无权操作')
    }
    await postService.deletePost(parseInt(id))

    return ok({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/admin/posts/:id] Error:', error?.message)
    return fail(error.message || '删除失败', 500)
  }
}
