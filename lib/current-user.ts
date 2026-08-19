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

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true },
    })
    if (!user) return null

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      accountId: user.accountId,
    }
  } catch {
    return null
  }
}

export async function getCurrentUserId(): Promise<number | null> {
  const user = await getCurrentUser()
  return user?.id ?? null
}
