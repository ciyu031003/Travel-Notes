import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { parseBody, withAuth } from '@/lib/api/handler'
import { memoryService } from '@/lib/modules/memory/memory.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { CreateSpaceMemorySchema } from '@/lib/api/schemas/space'

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
  const travelIdParam = request.nextUrl.searchParams.get('travelId')
  const travelId = travelIdParam ? parseInt(travelIdParam, 10) : null
  try {
    const memories = await memoryService.listMemories(auth.username, spaceId, Number.isFinite(travelId) ? travelId : null)
    return NextResponse.json({ memories })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

/** P1-17：body 由 zod 校验（标题必填、关联 id 正整数、可见性枚举）。 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, CreateSpaceMemorySchema)
  try {
    const result = await memoryService.createMemory(ctx.username || '', {
      spaceId,
      title: body.title,
      content: body.content ?? null,
      travelId: body.travelId ?? null,
      travelDayId: body.travelDayId ?? null,
      happenedAt: body.happenedAt ?? null,
      locationId: body.locationId ?? null,
      mood: body.mood ?? null,
      visibility: body.visibility,
    })
    return NextResponse.json({ success: true, memoryId: result.id }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '创建失败')
  }
})
