import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUserId } from '@/lib/current-user'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { getClientIp } from '@/lib/request-utils'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { recordClientError, CLIENT_ERROR_KINDS } from '@/lib/modules/diagnostics/client-error'
import { APP_VERSION, APP_BUILD_NUMBER } from '@/lib/app-version'

export const dynamic = 'force-dynamic'

/**
 * 客户端错误上报端点（P-07 后半，1.29.0）。
 *
 * 为什么匿名可报：崩溃发生在登录前的比例不低（启动链路/登录页本身），
 * 登录态只是增强字段（服务端能拿到就带上，拿不到就 null）。
 * 滥用面：payload 有界 + IP 限流（每 10 分钟 20 条）+ 客户端同 message 去重，
 * 匿名写入的风险可控；这也是"不能因为未登录就丢掉启动崩溃"的取舍。
 */
const ClientErrorSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().min(1).max(500),
  stack: z.string().max(4000).optional(),
  url: z.string().max(300).optional(),
  appVersion: z.string().max(20).optional(),
  buildNumber: z.number().int().min(0).max(10_000_000).optional(),
  platform: z.string().max(10).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const limit = await rateLimitShared({
      prefix: 'client-error:ip',
      key: ip || 'unknown',
      limit: 20,
      windowMs: 10 * 60 * 1000,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '上报过于频繁', retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 },
      )
    }

    const body = await parseBody(request, ClientErrorSchema)
    // 会话里有用户就带上（排障时按用户聚合）；拿不到不算失败
    const userId = await getCurrentUserId().catch(() => null)
    const row = await recordClientError({
      kind: body.kind,
      message: body.message,
      stack: body.stack,
      url: body.url,
      // 版本以服务端为准可以伪造问题……但这里信任客户端传值即可：诊断字段不是安全边界。
      // 缺省时用服务端自己的版本号兜底（App 壳版本与 API 部署通常同批）。
      appVersion: body.appVersion ?? APP_VERSION,
      buildNumber: body.buildNumber ?? APP_BUILD_NUMBER,
      platform: body.platform,
      userId,
    })
    return NextResponse.json({ success: true, id: row.id })
  } catch (error: unknown) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    // 上报通道自身的失败绝不能反噬客户端：静默 200 之外的错误也只记日志
    console.error('[diagnostics] client-error 写入失败:', error instanceof Error ? error.message : error)
    return NextResponse.json({ success: false }, { status: 200 })
  }
}
