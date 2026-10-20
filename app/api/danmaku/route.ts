import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { ok, fail, unauthorized } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth-middleware'
import { applyCacheControl } from '@/lib/http-cache'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { getClientIp } from '@/lib/request-utils'
import { z } from 'zod'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { IdSchema } from '@/lib/api/schemas/admin'

/** 发弹幕：内容非空 ≤50 字，颜色仅接受 #RGB/#RRGGBB（防注入样式） */
const DanmakuCreateSchema = z.object({
  text: z.string().trim().min(1, '留言内容不能为空').max(50, '留言内容不能超过50字'),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, '颜色格式不合法')
    .optional(),
})

// 公开接口：获取全部弹幕（从最近到最早）
export async function GET() {
  try {
    const list = await prisma.danmaku.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const danmakus = list.map((d) => ({
      id: d.id.toString(),
      text: d.text,
      color: d.color,
      timestamp: d.createdAt.getTime(),
    }))

    const res = ok({ danmakus })
    return applyCacheControl(res, 'public', false)
  } catch (error: any) {
    console.error('[GET /api/danmaku] Error:', error?.message)
    return ok({ danmakus: [] })
  }
}

// 公开接口：写入一条新弹幕
export async function POST(request: NextRequest) {
  try {
    // 阶段 A · A6：公开写接口按 IP 限流，防止刷弹幕
    const ip = getClientIp(request)
    const limit = await rateLimitShared({ prefix: 'danmaku:ip', key: ip || 'unknown', limit: 10, windowMs: 60_000 })
    if (!limit.ok) {
      return fail('发送过于频繁，请稍后再试', 429)
    }

    // P1-17：body 用 zod（内容非空/≤50 字、颜色白名单格式）
    const body = await parseBody(request, DanmakuCreateSchema)
    const text = body.text
    const color = body.color || '#E4B478'

    const created = await prisma.danmaku.create({
      data: {
        text,
        color,
      },
    })

    return ok({
      danmaku: {
        id: created.id.toString(),
        text: created.text,
        color: created.color,
        timestamp: created.createdAt.getTime(),
      },
    })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[POST /api/danmaku] Error:', error?.message)
    return fail(error.message || '发送失败', 500)
  }
}

// 需认证：删除一条弹幕
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  try {
    // P1-17：DELETE 无 body，用 query schema（id coerce 正整数）
    const { searchParams } = new URL(request.url)
    const idParsed = IdSchema.safeParse(searchParams.get('id'))
    if (!idParsed.success) {
      return errorResponse(new ApiError('INVALID_ID', '缺少弹幕ID', 400), getRequestId(request))
    }
    const id = idParsed.data

    await prisma.danmaku.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[DELETE /api/danmaku] Error:', error?.message)
    return fail(error.message || '删除失败', 500)
  }
}
