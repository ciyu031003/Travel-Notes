import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api-response'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'
import { asApiErrorFromResponse, parseIdParam, withRouteErrors } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/**
 * 「完成并归档」：把进行中的旅行正式成册。
 *
 * 语义（对应真机需求"用户确认后就自动添加到旅行画册和最近旅行模块里面"）：
 *  · `confirmedAt` 为空 → 进行中草稿：首页给一个大入口继续补照片/行程/花销，
 *    但不进「最近旅行」与画册；
 *  · 确认后写入时间戳 → 立刻出现在最近旅行与画册里。
 *
 * 幂等：重复调用不会改动首次归档时间（用户回头再点一次不该让"归档日"漂移）。
 *
 * P1-17：路径 id 走 zod 校验；无请求体（reviewed-no-body-input）。
 */
export const POST = withRouteErrors(async (request, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  // reviewed-no-body-input：归档操作只有路径参数，没有 JSON body
  const travelId = parseIdParam(id, '旅行 ID')

  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) throw await asApiErrorFromResponse(guard.response)

  const current = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { confirmedAt: true },
  })
  if (!current) throw new ApiError('NOT_FOUND', '旅行不存在', 404)

  const confirmedAt = current.confirmedAt ?? new Date()
  if (!current.confirmedAt) {
    await prisma.travel.update({ where: { id: travelId }, data: { confirmedAt }, select: { id: true } })
  }
  return NextResponse.json({ success: true, confirmedAt: confirmedAt.toISOString() })
})
