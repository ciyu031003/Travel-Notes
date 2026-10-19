import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { getTravelDetail, updateTravel, deleteTravel } from '@/lib/modules/travel/travel.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

/** 后台编辑旅行的请求体（P1-17）：只校验会被 updateTravel 消费的字段 */
const UpdateTravelSchema = z
  .object({
    title: z.string().trim().min(1, '请输入旅行名称').max(255, '旅行名称过长').optional(),
    description: z.string().max(50_000, '描述过长').nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED'], { message: '旅行状态无效' }).optional(),
    isPublic: z.boolean().optional(),
    visibility: z.string().optional(),
    budget: z.union([z.number(), z.string(), z.null()]).optional(),
    travelType: z.string().optional(),
    companions: z.array(z.unknown()).max(10, '同行者最多 10 人').optional(),
  })
  .passthrough()

function parseTravelId(id: string): number {
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) throw new ApiError('INVALID_ID', '无效 ID', 400)
  return travelId
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  const travel = await getTravelDetail(travelId, auth.payload?.userId)
  if (!travel) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
  return NextResponse.json({ travel })
}

export const PUT = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const denied = await requireCapability(ctx.userId, 'canManageContent')
  if (denied) return denied

  const { id } = await params
  const travelId = parseTravelId(id)
  const body = await parseBody(request, UpdateTravelSchema)

  const owned = await getTravelDetail(travelId, ctx.userId)
  if (!owned) throw new ApiError('NOT_FOUND', '旅行不存在或无权操作', 404)

  try {
    await updateTravel(travelId, body)
  } catch (error: any) {
    throw new ApiError('UPDATE_FAILED', error?.message || '更新失败', 400)
  }
  writeAuditLog({ username: ctx.username || 'unknown', action: 'UPDATE', resourceType: 'Travel', resourceId: String(travelId) }).catch(() => {})
  return NextResponse.json({ success: true })
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const denied = await requireCapability(ctx.userId, 'canManageContent')
  if (denied) return denied

  const { id } = await params
  const travelId = parseTravelId(id)
  try {
    await deleteTravel(travelId, ctx.userId)
  } catch (error: any) {
    throw new ApiError('DELETE_FAILED', error?.message || '删除失败', 400)
  }
  writeAuditLog({ username: ctx.username || 'unknown', action: 'DELETE', resourceType: 'Travel', resourceId: String(travelId) }).catch(() => {})
  return NextResponse.json({ success: true })
})
