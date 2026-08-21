import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { getMomentService } from '@/lib/container'
import { ok, fail, serverError, unauthorized, notFound } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied

  try {
    const { id: idParam } = await params
    const id = parseInt(idParam, 10)
    if (isNaN(id)) {
      return fail('无效的记录 ID')
    }

    const momentService = getMomentService()
    await momentService.deleteMoment(id, auth.payload?.userId)
    return ok(null, '删除成功')
  } catch (error: any) {
    if (error?.message === '记录不存在') {
      return notFound('记录不存在')
    }
    console.error('[DELETE /api/admin/moments] Error:', error?.message || error)
    return serverError()
  }
}
