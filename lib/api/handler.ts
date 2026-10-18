/**
 * API 路由统一封装（P1-17）。
 *
 * 目标：把「鉴权 + 401/503 + 请求 ID + 异常转统一错误格式」收口到一处，
 * 让写路由只需要关心业务；body 校验统一走 zod（parseBody）。
 *
 * 用法：
 *   export const POST = withAuth(async (request, { userId, username, requestId }) => {
 *     const body = await parseBody(request, CreateSchema)
 *     ...
 *     return ok(...) / NextResponse.json(...)
 *   })
 *
 * 兼容性：成功响应完全不变；失败统一为 { success:false, error, code, requestId }，
 * 旧客户端读 error 字段仍然工作（只是多了 code/requestId）。
 */
import { NextRequest, NextResponse } from 'next/server'
import type { ZodType, output } from 'zod'
import { requireAuth, type AuthResult } from '../auth-middleware'
import { ApiError, errorResponse } from '../api-response'

/** 透传给业务处理器的认证上下文 */
export interface ApiContext {
  auth: AuthResult
  requestId: string
  /** 当前用户 id（登录会话必有；兼容极老 token 可能为 undefined） */
  userId?: number
  username?: string
}

export interface WithAuthOptions {
  /** 处理器内部未转成 ApiError 的异常，默认按 500 处理；需要「业务错误 → 400」时可覆盖 */
  errorStatus?: number
  /** 覆盖默认的兜底错误文案（仅在非 ApiError 时使用） */
  errorMessage?: string
}

/**
 * 路由第二参数（{ params }）在 SDK 侧被 Next 的类型生成器严格校验；
 * 这里用 any 接住，避免不同动态段形状导致 .next/types 校验失败。
 * 动态路由内部自行收窄：`const { id } = await (routeContext as { params: Promise<{ id: string }> }).params`。
 */
type RouteContext = any

/**
 * 请求 ID：优先沿用上游（Nginx/网关）注入的 X-Request-Id，保证跨层可关联；
 * 没有则生成一个 UUID（crypto.randomUUID 在 Node 与 Edge 都可用）。
 */
export function getRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')
  if (incoming && /^[\w.:-]{8,128}$/.test(incoming)) return incoming
  try {
    return crypto.randomUUID()
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/**
 * 认证包装器：
 * - 未登录 → 401 { code: 'UNAUTHORIZED' }
 * - 数据库不可用导致无法校验会话 → 503（fail-closed，绝不是 200 放行）
 * - 处理器抛错 → errorResponse（ApiError 用其 code/status，其它 500 且隐藏细节）
 * - 响应头带 X-Request-Id
 */
export function withAuth(
  handler: (request: NextRequest, ctx: ApiContext, routeContext: RouteContext) => Promise<NextResponse> | NextResponse,
  options: WithAuthOptions = {},
): (request: NextRequest, routeContext?: RouteContext) => Promise<NextResponse> {
  return async (request: NextRequest, routeContext?: RouteContext): Promise<NextResponse> => {
    const requestId = getRequestId(request)
    const auth = await requireAuth(request)
    if (!auth.authenticated) {
      const res = auth.databaseUnavailable
        ? errorResponse(new ApiError('AUTH_UNAVAILABLE', '服务暂时不可用，请稍后重试', 503), requestId)
        : errorResponse(new ApiError('UNAUTHORIZED', '未授权', 401), requestId)
      res.headers.set('X-Request-Id', requestId)
      return res
    }

    try {
      const response = await handler(
        request,
        {
          auth,
          requestId,
          userId: auth.payload?.userId,
          username: auth.username,
        },
        routeContext,
      )
      response.headers.set('X-Request-Id', requestId)
      return response
    } catch (error) {
      let mapped: unknown = error
      if (!(error instanceof ApiError) && options.errorStatus) {
        mapped = new ApiError(
          error instanceof ApiError ? error.code : 'BAD_REQUEST',
          options.errorMessage || (error as Error)?.message || '请求处理失败',
          options.errorStatus,
        )
      }
      const response = errorResponse(mapped, requestId)
      response.headers.set('X-Request-Id', requestId)
      return response
    }
  }
}

/**
 * 解析并校验 JSON 请求体（zod）。
 * 失败统一抛 ApiError('VALIDATION_ERROR', 第一条中文提示, 400)；
 * 非 JSON 请求体抛 ApiError('INVALID_JSON')，不再出现「读 body 抛错 → 500」。
 */
export async function parseBody<S extends ZodType>(request: Request, schema: S): Promise<output<S>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError('INVALID_JSON', '请求体不是合法的 JSON', 400)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new ApiError('VALIDATION_ERROR', first?.message || '请求参数不合法', 400)
  }
  return parsed.data as output<S>
}
