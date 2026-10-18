import { NextResponse } from 'next/server'
import { parseBody, withAuth } from '@/lib/api/handler'
import { memoryService } from '@/lib/modules/memory/memory.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { AttachMemoryMediaSchema } from '@/lib/api/schemas/memory'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M2-A2：回忆-媒体 多对多关联。
 * POST /api/memories/[id]/media    { mediaIds: number[] } 关联
 * DELETE /api/memories/[id]/media  { mediaIds: number[] } 移除关联
 *
 * P1-17：mediaIds 由 zod 校验（非空、正整数、最多 50 个）；权限仍由 memory.service 判定。
 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const memoryId = parseIdParam(id, '回忆 ID')
  const body = await parseBody(request, AttachMemoryMediaSchema)
  try {
    await memoryService.attachMedia(ctx.username || '', memoryId, body.mediaIds)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '关联失败', 403)
  }
})

export const DELETE = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const memoryId = parseIdParam(id, '回忆 ID')
  const body = await parseBody(request, AttachMemoryMediaSchema)
  try {
    await memoryService.detachMedia(ctx.username || '', memoryId, body.mediaIds)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '移除关联失败', 403)
  }
})
