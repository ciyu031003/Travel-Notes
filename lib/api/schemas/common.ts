/**
 * P1-17 收尾 B：写路由共用的 zod 片段与路由壳。
 *
 * 为什么放在 lib/api/schemas 下：本轮只授权改动目标写路由与本目录；
 * `lib/api/handler.ts` 的 withAuth/parseBody 保持不动，这里复用它们并补齐：
 * ① 路径 id 校验（z.coerce.number().int().positive）
 * ② guard（lib/modules/travel/api-guard）旧格式响应 → 统一 ApiError
 * ③ 未使用 withAuth 的 guard 类路由的异常兜底（errorResponse + requestId）
 * ④ 可空 JSON body（如 PATCH notifications 允许无 body）
 *
 * 约束：失败信息只回传"看起来是业务提示"的短中文，其余用兜底文案 —— 不把
 * Prisma/SQL/堆栈等内部细节透给客户端（评审 P1-17 规则⑤）。
 */
import { NextRequest, NextResponse } from 'next/server'
import type { ZodType, output } from 'zod'
import { z } from 'zod'
import { ApiError, errorResponse } from '@/lib/api-response'
import { getRequestId } from '@/lib/api/handler'

/** 数字主键（路径参数 / body 内的 id）：字符串或数字 → 正整数 */
export const IdSchema = z.coerce
  .number({ message: 'ID 必须为数字' })
  .int('ID 必须为整数')
  .positive('ID 必须为正整数')

/** 解析路径 id；失败抛 400（消息只说明"哪个 ID 无效"，不含内部细节） */
export function parseIdParam(value: unknown, label = 'ID'): number {
  const parsed = IdSchema.safeParse(value)
  if (!parsed.success) throw new ApiError('INVALID_ID', `无效的${label}`, 400)
  return parsed.data
}

/** 日期/时间字符串：允许空串（调用方按旧语义当 null）与 null */
export const NullableDateStringSchema = z
  .string({ message: '日期格式不正确' })
  .max(40, '日期格式不正确')
  .refine((v) => v === '' || !Number.isNaN(new Date(v).getTime()), '日期格式不正确')
  .nullable()

/** 可空正整数 id：null 表示清空关联 */
export const NullableIdSchema = z.union([IdSchema, z.null()])

/** 业务错误 → ApiError。只回传"短中文业务提示"，其余用兜底文案，避免泄露内部信息。 */
const BUSINESS_HINT_RE =
  /(不存在|无权|未授权|不能|不可|不允许|失败|已存在|已被|已过期|需|请|无效|不合法|不足|至少|最多|超过|过长|格式|重复|占用|不在|为空)/
const UNSAFE_RE = /(prisma|sql|invalid\s+`|select\s|insert\s|update\s|delete\s+from|stack|at\s+\S+\s+\()/i

export function toApiError(
  error: unknown,
  fallback = '操作失败',
  status = 400,
  code = 'BAD_REQUEST',
): ApiError {
  if (error instanceof ApiError) return error
  const raw = error instanceof Error ? error.message : ''
  const safe = raw.length > 0 && raw.length <= 120 && !UNSAFE_RE.test(raw) && BUSINESS_HINT_RE.test(raw)
  return new ApiError(code, safe ? raw : fallback, status)
}

/**
 * guard 返回的旧格式响应（`{ error }`）→ 统一 ApiError。
 * 保留原状态码与文案，只是把响应形态统一为 `{ success:false, error, code, requestId }`。
 */
export async function asApiErrorFromResponse(response: NextResponse): Promise<ApiError> {
  const status = response.status
  const code =
    status === 401 ? 'UNAUTHORIZED'
      : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
          : status === 429 ? 'RATE_LIMITED'
            : 'BAD_REQUEST'
  let message =
    status === 401 ? '未授权'
      : status === 403 ? '权限不足'
        : status === 404 ? '资源不存在'
          : '请求参数不合法'
  try {
    const body = (await response.clone().json()) as { error?: unknown }
    if (typeof body?.error === 'string' && body.error) message = body.error
  } catch {
    // 非 JSON 响应：沿用兜底文案
  }
  return new ApiError(code, message, status)
}

type RouteContext = any
type RouteHandler = (request: NextRequest, routeContext?: RouteContext) => Promise<NextResponse>

/**
 * 未使用 withAuth 的路由壳（guard 类路由用）：统一 requestId + 异常转统一错误格式。
 * 刻意**不做鉴权**——鉴权仍在 guard / requireAuth 内，避免同一请求重复做两次会话校验。
 */
export function withRouteErrors(handler: RouteHandler): RouteHandler {
  return async (request, routeContext) => {
    const requestId = getRequestId(request)
    try {
      const response = await handler(request, routeContext)
      response.headers.set('X-Request-Id', requestId)
      return response
    } catch (error) {
      const response = errorResponse(error, requestId)
      response.headers.set('X-Request-Id', requestId)
      return response
    }
  }
}

/** 可选 JSON body：无 body → undefined；非法 JSON → 400；校验失败 → 400（第一条中文提示） */
export async function parseOptionalBody<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<output<S> | undefined> {
  let text: string
  try {
    text = await request.text()
  } catch {
    text = ''
  }
  if (!text.trim()) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(text)
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
