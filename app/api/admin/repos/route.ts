import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getRepoService } from '@/lib/container'
import { ok, fail, unauthorized, serverError } from '@/lib/api-response'
import { CreateRepoSchema } from '@/lib/validators/repo.validator'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const repoService = getRepoService()
    const result = await repoService.getAllReposWithMetadata()
    return ok(result)
  } catch (error: any) {
    console.error('[GET /api/admin/repos] Error:', error?.message)
    return serverError()
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  try {
    const body = await request.json()
    const validation = CreateRepoSchema.safeParse(body)
    if (!validation.success) {
      return fail(validation.error.message, 400)
    }

    const repoService = getRepoService()
    const result = await repoService.createRepo(validation.data)
    return ok({ id: result.id }, '创建成功')
  } catch (error: any) {
    console.error('[POST /api/admin/repos] Error:', error?.message)
    return serverError()
  }
}
