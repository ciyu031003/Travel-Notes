import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-middleware'
import { travelService } from '@/lib/modules/travel/space-travel.service'
import { ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

/** 前台编辑旅行的请求体（P1-17）：字段与 travelService.updateTravel 的入参对齐 */
const UpdateTravelSchema = z.object({
  title: z.string().trim().min(1, '旅行名称不能为空').max(255, '旅行名称过长').optional(),
  slug: z.string().max(255).optional(),
  description: z.string().max(50_000, '描述过长').nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED'], { message: '旅行状态无效' }).optional(),
  visibility: z.string().optional(),
  travelType: z.string().optional(),
  companions: z.array(z.unknown()).max(10, '同行者最多 10 人').optional(),
})

function parseTravelId(id: string): number {
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) throw new ApiError('INVALID_ID', '无效的旅行 ID', 400)
  return travelId
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(_request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) {
    return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
  }
  try {
    const travel = await travelService.getTravel(auth.username, travelId)
    return NextResponse.json({ travel })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseTravelId(id)
  const body = await parseBody(request, UpdateTravelSchema)
  try {
    const travel = await travelService.updateTravel(ctx.username || '', travelId, {
      title: body.title,
      slug: body.slug,
      description: body.description ?? undefined,
      startDate: body.startDate ?? undefined,
      endDate: body.endDate ?? undefined,
      status: body.status,
      // service 入参是 Prisma 枚举；这里保持「非法值由 service 归一/忽略」的原行为
      visibility: body.visibility as any,
      travelType: body.travelType as any,
      companions: body.companions,
    })
    return NextResponse.json({ success: true, travel })
  } catch (error: any) {
    throw new ApiError('UPDATE_FAILED', error?.message || '更新失败', 400)
  }
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseTravelId(id)
  try {
    await travelService.deleteTravel(ctx.username || '', travelId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const msg = error?.message || '删除失败'
    /**
     * 「旅行不存在」用 404 表达（此前统一 400）。
     *
     * 为什么重要：本地还留着行、但云端已经删掉的情况很常见
     * （用户删过一次、或先离线删后联网）。客户端据此把 404 当作
     * **"目标状态已达成"**处理并完成本地清理，而不是弹"删除失败"
     * 让用户反复点 —— 真机反馈「新建的几篇显示待同步、删除不了」即此。
     */
    throw new ApiError(msg.includes('不存在') ? 'NOT_FOUND' : 'DELETE_FAILED', msg, msg.includes('不存在') ? 404 : 400)
  }
})
