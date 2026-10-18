import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api-response'
import { parseBody, withAuth } from '@/lib/api/handler'
import { addDay } from '@/lib/modules/travel/travel.service'
import { canActOnContent } from '@/lib/modules/access'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { AddTravelDaySchema } from '@/lib/api/schemas/travel'

export const dynamic = 'force-dynamic'

/**
 * 前台「添加一天」：给旅行补一个「天」。
 *
 * 为什么需要：按天时间线是旅行记录的主结构，但前台一直没有加天的入口 ——
 * 用户若建旅行时没填日期，或想临时多记一天（出发前一夜、路上多待的一天），
 * 就完全没有办法。离线队列的 TRAVEL_DAY 也依赖这个接口落地。
 *
 * 权限与其它前台写接口一致：OWNER 或空间成员。
 *
 * P1-17：body 由 zod 校验（date/title/summary），路径 id 统一正整数校验。
 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')
  const body = await parseBody(request, AddTravelDaySchema)

  try {
    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: { visibility: true, isPublic: true, ownerId: true, spaceId: true },
    })
    if (!travel) throw new ApiError('NOT_FOUND', '旅行不存在', 404)
    if (!(await canActOnContent('Travel', travel, ctx.userId))) {
      throw new ApiError('FORBIDDEN', '无权编辑该旅行', 403)
    }

    const result = await addDay(travelId, {
      date: body.date ? body.date : undefined,
      title: body.title ? body.title : undefined,
      summary: body.summary ? body.summary : undefined,
    })
    // 回传 id：离线队列靠它回填 remoteId，后续「记一笔」才能挂到这一天
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '添加失败')
  }
})
