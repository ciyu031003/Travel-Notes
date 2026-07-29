import { NextResponse } from 'next/server'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export function ok<T>(data?: T, message?: string): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    message,
  } as ApiResponse<T>)
}

export function fail(error: string, status: number = 400): NextResponse {
  return NextResponse.json({
    success: false,
    error,
  } as ApiResponse, { status })
}

export function notFound(message: string = '资源不存在'): NextResponse {
  return fail(message, 404)
}

export function unauthorized(message: string = '未授权'): NextResponse {
  return fail(message, 401)
}

export function forbidden(message: string = '权限不足'): NextResponse {
  return fail(message, 403)
}

export function serverError(message: string = '服务器内部错误'): NextResponse {
  return fail(message, 500)
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
