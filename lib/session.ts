/**
 * 会话校验的唯一入口（P1-10）。
 *
 * 背景：JWT 只证明「这个 token 是我们签的」，不能证明「这次会话仍然有效」。
 * 会话撤销（注销/改密/踢设备/管理员封禁）写在 Session 表里，所以任何「当前用户」
 * 判定都必须回查数据库。此前只有 requireAuth 查库，getCurrentUser（服务端组件 /
 * 大量 API 的 getCurrentUserId）只验签，导致**撤销后旧 JWT 仍能读写数据**。
 *
 * fail-closed 原则：数据库异常时返回「无效 + databaseUnavailable」，
 * 调用方应拒绝请求（503/401），绝不允许退化成「仅 JWT 放行」。
 */
import { skipDbOnBuild } from './db-guard'
import { prismaSessionRepository } from './repositories/session-repository'

export type SessionInvalidReason = 'no-sid' | 'not-found' | 'revoked' | 'expired' | 'db-error' | 'build-skip'

export interface ValidatedSession {
  id: string
  username: string
  expiresAt: Date
  /** 距过期剩余秒数（可能为负，仅在 valid 时非负） */
  remainingSeconds: number
}

export interface SessionValidation {
  valid: boolean
  reason?: SessionInvalidReason
  /** 数据库不可用（区别于「会话确实无效」）：调用方应返回 5xx 而不是 401 */
  databaseUnavailable?: boolean
  session?: ValidatedSession
}

/**
 * 校验数据库会话：存在 + 未撤销 + 未过期。
 * @param sid JWT 里的 sid（缺失即视为无效：无法撤销的会话不应被信任）
 * @param now 可注入时钟，便于单测
 */
export async function validateSession(
  sid: string | null | undefined,
  now: Date = new Date(),
): Promise<SessionValidation> {
  if (!sid) return { valid: false, reason: 'no-sid' }
  // 构建期（SKIP_DB_ON_BUILD=1）本来就没有数据库连接：按未认证处理即可，
  // 不要在这里抛错把 next build 打挂（构建产物只是轻量壳，运行时会重新渲染）。
  if (skipDbOnBuild()) return { valid: false, reason: 'build-skip', databaseUnavailable: true }
  try {
    const session = await prismaSessionRepository.findById(sid)
    if (!session) return { valid: false, reason: 'not-found' }
    if (session.revokedAt) return { valid: false, reason: 'revoked' }
    if (session.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: 'expired' }
    return {
      valid: true,
      session: {
        id: session.id,
        username: session.username,
        expiresAt: session.expiresAt,
        remainingSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)),
      },
    }
  } catch (error) {
    // fail-closed：数据库查不到会话时就当未登录，绝不放行
    console.error('[session] 会话校验查询失败（fail-closed）：', (error as Error)?.message || error)
    return { valid: false, reason: 'db-error', databaseUnavailable: true }
  }
}

/** 节流更新 lastUsedAt（失败只影响统计，不影响认证结果） */
export function touchSessionLastUsed(sid: string | null | undefined): void {
  if (!sid) return
  prismaSessionRepository.touchLastUsed(sid).catch(() => {})
}
