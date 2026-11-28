/**
 * 计划类路由的错误映射（私有目录，不会被当成路由）。
 *
 * 权限 → 403 / 不存在 → 404 / 业务校验 → 400（中文提示）；
 * P1a 新增：行级 version 冲突 → 409，且**回传当前行**（前端可一键采用对方/保留自己的）。
 */
import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { SpaceAccessError } from '@/lib/modules/space/permissions'
import { PlanConflictError, SpacePlanNotFoundError } from '@/lib/modules/space/space-plan-errors'
import { toApiError } from '@/lib/api/schemas/common'

export function planApiError(error: unknown, fallback = '操作失败'): never {
  if (error instanceof ApiError) throw error
  if (error instanceof SpaceAccessError) {
    throw new ApiError('FORBIDDEN', error.message || '权限不足', 403)
  }
  if (error instanceof SpacePlanNotFoundError) {
    throw new ApiError('NOT_FOUND', error.message || '旅行计划不存在', 404)
  }
  throw toApiError(error, fallback)
}

/**
 * 写操作统一错误出口：版本冲突转 409（带 current 当前行），其余交给 planApiError（抛 ApiError）。
 * 返回类型是 NextResponse 只为让路由写成 `return planWriteError(...)`，不会真的正常返回。
 */
export function planWriteError(error: unknown, fallback = '操作失败'): NextResponse {
  if (error instanceof PlanConflictError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: 'VERSION_CONFLICT',
        current: error.current ?? null,
        expectedVersion: error.expectedVersion ?? null,
      },
      { status: 409 },
    )
  }
  return planApiError(error, fallback)
}
