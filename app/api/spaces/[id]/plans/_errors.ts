/**
 * 计划类路由的错误映射（私有目录，不会被当成路由）。
 *
 * 三个 plan 路由的异常处理完全一致：把「权限 → 403 / 不存在 → 404 /
 * 业务校验 → 400（带中文提示）」收口到一处，避免各路由写出不同的状态码。
 */
import { ApiError } from '@/lib/api-response'
import { SpaceAccessError } from '@/lib/modules/space/permissions'
import { SpacePlanNotFoundError } from '@/lib/modules/space/space-plan.service'
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
