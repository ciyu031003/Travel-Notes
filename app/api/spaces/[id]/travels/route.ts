import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { parseBody, withAuth } from '@/lib/api/handler'
import { travelService } from '@/lib/modules/travel/space-travel.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { CreateSpaceTravelSchema } from '@/lib/api/schemas/space'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(_request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const spaceId = parseInt(id, 10)
  if (isNaN(spaceId)) {
    return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
  }
  try {
    const travels = await travelService.listTravels(auth.username, spaceId)
    return NextResponse.json({ travels })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

/** P1-17：body 由 zod 校验（标题/标识格式/日期/枚举）；slug 唯一与空间角色仍在服务层。 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, CreateSpaceTravelSchema)
  try {
    const result = await travelService.createTravel(ctx.username || '', {
      spaceId,
      title: body.title,
      slug: body.slug,
      description: body.description ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      status: body.status,
      visibility: body.visibility,
      travelType: body.travelType,
      companions: body.companions,
    })
    return NextResponse.json({ success: true, travelId: result.id }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '创建失败')
  }
})
