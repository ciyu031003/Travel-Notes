import { NextResponse } from 'next/server'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  /** 稳定的错误码（前端据此分支，不用匹配中文文案）；成功响应不带 */
  code?: string
  /** 请求追踪 ID（与服务端日志一致，便于用户报错时定位） */
  requestId?: string
  message?: string
}

export function ok<T>(data?: T, message?: string): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    message,
  } as ApiResponse<T>)
}

export function fail(error: string, status: number = 400, code?: string): NextResponse {
  return NextResponse.json({
    success: false,
    error,
    ...(code ? { code } : {}),
  } as ApiResponse, { status })
}

export function notFound(message: string = '资源不存在'): NextResponse {
  return fail(message, 404, 'NOT_FOUND')
}

export function unauthorized(message: string = '未授权'): NextResponse {
  return fail(message, 401, 'UNAUTHORIZED')
}

export function forbidden(message: string = '权限不足'): NextResponse {
  return fail(message, 403, 'FORBIDDEN')
}

export function serverError(message: string = '服务器内部错误'): NextResponse {
  return fail(message, 500, 'INTERNAL_ERROR')
}

/**
 * 业务异常（P1-17）：路由里 throw，由 withAuth/errorResponse 统一转成
 * `{ success:false, error, code, requestId }`。
 * code 用大写下划线常量（如 VALIDATION_ERROR / NOT_FOUND），前端按 code 分支。
 */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number = 400) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/**
 * 统一错误响应（P1-17）：
 * - ApiError → 原样使用其 message/code/status（message 是面向前端的中文提示）；
 * - 其它异常 → 500 + 通用文案（**不把 error.message 泄漏给客户端**，原文只进服务端日志）；
 * - requestId 始终回传，便于把用户截图和服务端日志对上。
 */
export function errorResponse(err: unknown, requestId?: string): NextResponse {
  let status = 500
  let message = '服务器内部错误'
  let code = 'INTERNAL_ERROR'

  if (err instanceof ApiError) {
    status = err.status
    message = err.message
    code = err.code
  } else {
    // 非预期异常：记录完整栈（服务端），对外只给通用文案
    console.error(`[api] 未处理异常${requestId ? ` requestId=${requestId}` : ''}:`, err)
  }

  const body: ApiResponse = { success: false, error: message, code }
  if (requestId) body.requestId = requestId
  return NextResponse.json(body, { status })
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  } as PaginatedResponse<T>)
}

export function getPaginationFromSearchParams(
  searchParams: URLSearchParams,
  defaultPageSize: number = 20
): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || String(defaultPageSize))))
  return { page, pageSize }
}

/** 旧版宽松合并工具：保留以兼容存量路由（新路由请用 zod parseBody） */
export function parseBody<T extends Record<string, any>>(body: any, defaults?: Partial<T>): T {
  const result = { ...(defaults || {}) } as T
  if (!body || typeof body !== 'object') return result
  for (const key of Object.keys(body)) {
    if (body[key] !== undefined) {
      ;(result as any)[key] = body[key]
    }
  }
  return result
}
