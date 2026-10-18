import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api-response'
import { parseBody, withAuth } from '@/lib/api/handler'
import { canManageTravel, updateTravelInfo } from '@/lib/modules/travel/travel.service'
import { toApiError } from '@/lib/api/schemas/common'
import { UpdateTravelInfoSchema } from '@/lib/api/schemas/travel'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const travel = await prisma.travel.findFirst({
    where: { slug },
    select: { id: true, title: true, slug: true, spaceId: true },
  })
  if (!travel) return NextResponse.json({ travel: null }, { status: 404 })
  return NextResponse.json({ travel })
}

/**
 * 编辑旅行基本信息：标题 / 目的地 / 日期区间 / 描述。
 *
 * 为什么需要：用户反馈"建完的旅行看不到、也没法进一步设置"——
 * 此前除后台 /admin 外，前台**没有任何**修改入口：目的地写错、日期漏填都无法补救，
 * 只能删掉重建（而删除会连带回忆与照片）。这里补上前台的编辑闭环。
 *
 * 权限与其它前台写接口一致：owner 或空间成员（`canManageTravel`）。
 * 标题变更会重算 slug，响应里回传新 slug，前台据此 replace 地址。
 *
 * P1-17：body 由 zod 校验（标题长度/日期格式/预算范围/封面 id）；空串仍按旧语义当 null。
 */
export const PUT = withAuth(async (request, _ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ slug: string }> }
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const body = await parseBody(request, UpdateTravelInfoSchema)

  try {
    const travel = await prisma.travel.findFirst({ where: { slug }, select: { id: true } })
    if (!travel) throw new ApiError('NOT_FOUND', '旅行不存在', 404)
    if (!(await canManageTravel(travel.id, _ctx.userId))) {
      throw new ApiError('FORBIDDEN', '无权编辑该旅行', 403)
    }

    const result = await updateTravelInfo(travel.id, {
      title: body.title,
      location: body.location,
      description: body.description === undefined ? undefined : body.description ?? '',
      startDate: body.startDate === undefined ? undefined : body.startDate ? String(body.startDate) : null,
      endDate: body.endDate === undefined ? undefined : body.endDate ? String(body.endDate) : null,
      // 花销 tab 的预算：null 表示清空；缺省表示不改
      budget: body.budget === undefined ? undefined : body.budget === null ? null : Number(body.budget),
      // 相册 tab 的「设为封面」：null 表示恢复默认（第一张）
      coverMediaId: body.coverMediaId === undefined ? undefined : body.coverMediaId === null ? null : Number(body.coverMediaId),
    })

    return NextResponse.json({ success: true, slug: result.slug, daysChanged: result.daysChanged })
  } catch (error) {
    throw toApiError(error, '保存失败')
  }
})
