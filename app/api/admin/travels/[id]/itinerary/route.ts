import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { addItineraryItem, findTravelIdByDayId, canManageTravel } from '@/lib/modules/travel/travel.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { ItineraryItemCreateSchema } from '@/lib/api/schemas/admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  try {
    // P1-17：body 统一 zod（dayId 正整数、title 必填）
    const body = await parseBody(request, ItineraryItemCreateSchema)
    const dayId = body.dayId
    const title = body.title
    const travelId = await findTravelIdByDayId(dayId)
    if (!travelId || !(await canManageTravel(travelId, auth.payload?.userId))) {
      return NextResponse.json({ error: '旅行不存在或无权操作' }, { status: 404 })
    }
    const result = await addItineraryItem(dayId, {
      title,
      startTime: body.startTime || undefined,
      endTime: body.endTime || undefined,
      type: body.type || 'SPOT',
      notes: body.notes ? String(body.notes) : undefined,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '添加失败' }, { status: 400 })
  }
}
