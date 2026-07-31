import { NextRequest } from 'next/server'
import { getRepoService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name') || ''
    if (!name) {
      return fail('name 参数不能为空', 400)
    }

    const repoService = getRepoService()
    const repo = await repoService.getRepoByName(name)
    return ok({ available: !repo })
  } catch (error: any) {
    console.error('[GET /api/admin/repos/check-name] Error:', error?.message)
    return serverError()
  }
}
