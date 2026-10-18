import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { updateDay, deleteDay, findTravelIdByDayId, canManageTravel } from '@/lib/modules/travel/travel.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { IdSchema, TravelDayUpdateSchema } from '@/lib/api/schemas/admin'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; dayId: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { dayId } = await params
  const idParsed = IdSchema.safeParse(dayId)
  if (!idParsed.success) return errorResponse(new ApiError('INVALID_ID', '无效 ID', 400), getRequestId(request))
  const id = idParsed.data
  const travelId = await findTravelIdByDayId(id)
  if (!travelId || !(await canManageTravel(travelId, auth.payload?.userId))) {
    return NextResponse.json({ error: '旅行不存在或无权操作' }, { status: 404 })
  }
  try {
    // P1-17：更新 body 用 zod（date/title/summary 可选）
    const body = await parseBody(request, TravelDayUpdateSchema)
    await updateDay(id, body)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; dayId: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  // reviewed-no-body-input: DELETE 无请求体，只校验路径 ID（zod coerce 正整数）
  const { dayId } = await params
  const idParsed = IdSchema.safeParse(dayId)
  if (!idParsed.success) return errorResponse(new ApiError('INVALID_ID', '无效 ID', 400), getRequestId(request))
  const id = idParsed.data
  const travelId = await findTravelIdByDayId(id)
  if (!travelId || !(await canManageTravel(travelId, auth.payload?.userId))) {
    return NextResponse.json({ error: '旅行不存在或无权操作' }, { status: 404 })
  }
  try {
    await deleteDay(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
