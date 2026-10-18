import { NextRequest } from 'next/server'
import { getLikeService } from '@/lib/container'
import { ok, fail, serverError, ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const TargetTypeSchema = z.enum(['post', 'moment'], { message: '参数不完整：targetType/targetId 必填' })
/** targetId 兼容数字/字符串（旧客户端两种都传），统一转字符串 */
const TargetIdSchema = z.union([z.string().min(1), z.number()]).transform((v) => String(v))

/** 点赞切换（POST） */
const LikeToggleSchema = z.object({
  targetType: TargetTypeSchema,
  targetId: TargetIdSchema,
  visitorId: z.string().trim().min(1, '缺少访客标识').max(128, '访客标识过长'),
})

/** 点赞状态查询（GET query） */
const LikeStateQuerySchema = z.object({
  targetType: TargetTypeSchema,
  targetId: TargetIdSchema,
  visitorId: z.string().trim().max(128).optional(),
})

export async function GET(request: NextRequest) {
  try {
    // P1-17：query 用 zod（targetType 枚举、targetId 非空）
    const { searchParams } = new URL(request.url)
    const parsedQuery = LikeStateQuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsedQuery.success) {
      return errorResponse(
        new ApiError('VALIDATION_ERROR', parsedQuery.error.issues[0]?.message || '参数不完整：targetType/targetId 必填', 400),
        getRequestId(request),
      )
    }
    const { targetType, targetId, visitorId } = parsedQuery.data

    const likeService = getLikeService()
    const state = await likeService.getState(targetType, targetId, visitorId)
    return ok(state)
  } catch (error: any) {
    console.error('[GET /api/likes] Error:', error?.message || error)
    return serverError()
  }
}

export async function POST(request: NextRequest) {
  try {
    // P1-17：body 用 zod（targetType 枚举、targetId 非空、visitorId 必填）
    const { targetType, targetId, visitorId } = await parseBody(request, LikeToggleSchema)

    const likeService = getLikeService()
    const state = await likeService.toggle(targetType, targetId, visitorId)
    return ok(state)
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[POST /api/likes] Error:', error?.message || error)
    if (error?.message?.includes('访客标识')) {
      return fail(error.message)
    }
    return serverError()
  }
}
