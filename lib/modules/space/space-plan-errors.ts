/**
 * 计划模块的错误类型（P1a 把「不存在 / 版本冲突」抽出来，供 service 与路由共用）。
 *
 * 为什么单独一个文件：协同服务与计划服务互相引用会成环，错误类型放这里两边都能 import。
 */

/** 计划不存在 / 不属于该空间 → 404（不区分，避免跨空间探测） */
export class SpacePlanNotFoundError extends Error {
  constructor(message = '旅行计划不存在') {
    super(message)
    this.name = 'SpacePlanNotFoundError'
  }
}

export interface PlanVersionConflictDetail {
  /** 冲突时数据库里的当前行（前端一键采用/保留自己用） */
  current?: unknown
  /** 期望的 version（调用方带来的） */
  expectedVersion?: number
}

/**
 * 乐观锁冲突 → 409。
 * 语义（docs/plan-p1-collab-spec.md §3）：PATCH 带 version，不匹配返回 409 + 当前行。
 */
export class PlanConflictError extends Error {
  readonly current?: unknown
  readonly expectedVersion?: number

  constructor(detail: PlanVersionConflictDetail = {}, message = '这条刚被其他人改过，请刷新后再试') {
    super(message)
    this.name = 'PlanConflictError'
    this.current = detail.current
    this.expectedVersion = detail.expectedVersion
  }
}

/** 参数类错误（保持与 toApiError 一致的「中文业务提示」） */
export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanValidationError'
  }
}
