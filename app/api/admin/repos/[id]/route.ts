import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getRepoService } from '@/lib/container'
import { ok, fail, notFound, unauthorized, serverError } from '@/lib/api-response'
import { UpdateRepoSchema } from '@/lib/validators/repo.validator'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  const { id } = await params
  try {
    const repoService = getRepoService()
    const repo = await repoService.getRepoById(parseInt(id))
    if (!repo) {
      return notFound('仓库不存在')
    }
    return ok(repo)
  } catch (error: any) {
    console.error('[GET /api/admin/repos/:id] Error:', error?.message)
    return serverError()
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
    const validation = UpdateRepoSchema.safeParse(body)
    if (!validation.success) {
      return fail(validation.error.message, 400)
    }

    const repoService = getRepoService()
    await repoService.updateRepo(parseInt(id), validation.data)
    return ok(null, '更新成功')
  } catch (error: any) {
    console.error('[PUT /api/admin/repos/:id] Error:', error?.message)
    return serverError()
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  const { id } = await params
  try {
    const repoService = getRepoService()
    await repoService.deleteRepo(parseInt(id))
    return ok(null, '删除成功')
  } catch (error: any) {
    console.error('[DELETE /api/admin/repos/:id] Error:', error?.message)
    return serverError()
  }
}
