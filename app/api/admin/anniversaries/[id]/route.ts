import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { updateAnniversary, deleteAnniversary } from '@/lib/modules/anniversary/anniversary.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { AnniversaryUpdateSchema, IdSchema } from '@/lib/api/schemas/admin'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const idParsed = IdSchema.safeParse(id)
  if (!idParsed.success) {
    return errorResponse(new ApiError('INVALID_ID', '无效 ID', 400), getRequestId(request))
  }
  const anniversaryId = idParsed.data
  try {
    // P1-17：更新 body 用 zod（字段可选，至少一项）
    const body = await parseBody(request, AnniversaryUpdateSchema)
    const input: any = {}
    if (body.title !== undefined) input.title = body.title
    if (body.date !== undefined) {
      const date = new Date(body.date)
      if (isNaN(date.getTime())) throw new ApiError('INVALID_DATE', '无效日期', 400)
      input.date = date
    }
    if (body.recurring !== undefined) input.recurring = !!body.recurring
    if (body.description !== undefined) input.description = body.description ? String(body.description) : null

    await updateAnniversary(anniversaryId, input)
    writeAuditLog({ username: auth.username, action: 'UPDATE', resourceType: 'Anniversary', resourceId: String(anniversaryId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const idParsed = IdSchema.safeParse(id)
  if (!idParsed.success) {
    return errorResponse(new ApiError('INVALID_ID', '无效 ID', 400), getRequestId(request))
  }
  const anniversaryId = idParsed.data
  try {
    // reviewed-no-body-input: DELETE 无请求体，只校验路径 ID（上面 zod）
    await deleteAnniversary(anniversaryId)
    writeAuditLog({ username: auth.username, action: 'DELETE', resourceType: 'Anniversary', resourceId: String(anniversaryId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
