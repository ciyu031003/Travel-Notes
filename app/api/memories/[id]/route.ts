import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { parseBody, withAuth } from '@/lib/api/handler'
import { memoryService } from '@/lib/modules/memory/memory.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { UpdateMemorySchema } from '@/lib/api/schemas/memory'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(_request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const memoryId = parseInt(id, 10)
  if (isNaN(memoryId)) {
    return NextResponse.json({ error: '无效的回忆 ID' }, { status: 400 })
  }
  try {
    const memory = await memoryService.getMemory(auth.username, memoryId)
    return NextResponse.json({ memory })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

/** P1-17：路径 id 与 PATCH body 都由 zod 校验；权限仍由 memory.service 的 RBAC 判定。 */
export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const memoryId = parseIdParam(id, '回忆 ID')
  const body = await parseBody(request, UpdateMemorySchema)
  try {
    const memory = await memoryService.updateMemory(ctx.username || '', memoryId, {
      title: body.title,
      content: body.content,
      happenedAt: body.happenedAt,
      travelId: body.travelId,
      travelDayId: body.travelDayId,
      locationId: body.locationId,
      mood: body.mood,
      visibility: body.visibility,
    })
    return NextResponse.json({ success: true, memory })
  } catch (error) {
    throw toApiError(error, '更新失败')
  }
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  // reviewed-no-body-input：DELETE 仅路径参数，没有 JSON body
  const memoryId = parseIdParam(id, '回忆 ID')
  try {
    await memoryService.deleteMemory(ctx.username || '', memoryId, ctx.userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '删除失败')
  }
})
