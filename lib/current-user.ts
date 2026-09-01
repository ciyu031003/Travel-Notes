import { cookies } from 'next/headers'
import { verifyToken } from './services/token-service'
import { prisma } from './db'

export interface CurrentUser {
  id: number
  username: string
  nickname: string | null
  avatarUrl: string | null
  accountId: string | null
}

/**
 * 当前用户短缓存（阶段 A · A5）：
 * 每个读接口都会调用 getCurrentUser() 回查 DB（user.findUnique），
 * 登录用户高频访问时每请求 1 次 DB。这里按 userId 做 30s 短缓存，
 * 昵称/头像/账号等低频变化字段容忍 30s 滞后（自愈）。
 * 资料修改入口（profile/avatar/username/email）会显式 invalidateCurrentUserCache。
 */
const USER_CACHE_TTL_MS = 30_000
const userCache = new Map<number, { user: CurrentUser; expireAt: number }>()

/** 资料变更后调用，立即失效缓存，保证下次请求读到最新 */
export function invalidateCurrentUserCache(userId: number): void {
  userCache.delete(userId)
}

function cacheGet(userId: number): CurrentUser | null {
  const entry = userCache.get(userId)
  if (!entry) return null
  if (Date.now() > entry.expireAt) {
    userCache.delete(userId)
    return null
  }
  return entry.user
}

function cacheSet(user: CurrentUser): void {
  userCache.set(user.id, { user, expireAt: Date.now() + USER_CACHE_TTL_MS })
}

/**
 * 服务端组件/路由读取当前登录用户（从 httpOnly 会话 Cookie 解析 JWT）。
 * 未登录返回 null；仅校验签名与有效期，并回查数据库获取昵称/头像/账号 ID。
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const store = await cookies()
    const token = store.get('admin_session')?.value
    if (!token) return null
    const payload = await verifyToken(token)
    if (!payload?.userId) return null

    const cached = cacheGet(payload.userId)
    if (cached) return cached

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true },
    })
    if (!user) return null

    const currentUser: CurrentUser = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      accountId: user.accountId,
    }
    cacheSet(currentUser)
    return currentUser
  } catch {
    return null
  }
}

export async function getCurrentUserId(): Promise<number | null> {
  const user = await getCurrentUser()
  return user?.id ?? null
}
