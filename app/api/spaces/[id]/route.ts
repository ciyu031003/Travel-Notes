import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { parseBody, withAuth } from '@/lib/api/handler'
import { spaceService } from '@/lib/modules/space/space.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { UpdateSpaceSchema } from '@/lib/api/schemas/space'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const spaceId = parseInt(id, 10)
  if (isNaN(spaceId)) {
    return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
  }
  try {
    const space = await spaceService.getSpace(auth.username, spaceId)
    return NextResponse.json({ space })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

/** P1-17：写路由 body 由 zod 校验（名称/简介/类型/封面）；GET 保持原实现不动。 */
export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, UpdateSpaceSchema)
  try {
    await spaceService.updateSpace(ctx.username || '', spaceId, {
      name: body.name,
      description: body.description,
      spaceType: body.spaceType,
      coverMediaId: body.coverMediaId,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    throw toApiError(error, '更新失败', msg.includes('无权') ? 403 : 400)
  }
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  // reviewed-no-body-input：DELETE 仅路径参数，没有 JSON body
  const spaceId = parseIdParam(id, '空间 ID')
  try {
    await spaceService.deleteSpace(ctx.username || '', spaceId)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '删除失败', 403)
  }
})
