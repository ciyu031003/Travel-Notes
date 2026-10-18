import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { getMomentService } from '@/lib/container'
import { ok, fail, serverError, unauthorized, notFound, ApiError, errorResponse } from '@/lib/api-response'
import { getRequestId } from '@/lib/api/handler'
import { IdSchema } from '@/lib/api/schemas/admin'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied

  try {
    // reviewed-no-body-input: DELETE 无请求体，只校验路径 ID（zod coerce 正整数）
    const { id: idParam } = await params
    const idParsed = IdSchema.safeParse(idParam)
    if (!idParsed.success) {
      return errorResponse(new ApiError('INVALID_ID', '无效的记录 ID', 400), getRequestId(request))
    }
    const id = idParsed.data

    const momentService = getMomentService()
    await momentService.deleteMoment(id, auth.payload?.userId)
    return ok(null, '删除成功')
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    if (error?.message === '记录不存在') {
      return notFound('记录不存在')
    }
    console.error('[DELETE /api/admin/moments] Error:', error?.message || error)
    return serverError()
  }
}
