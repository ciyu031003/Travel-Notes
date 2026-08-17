import { cookies } from 'next/headers'
import { verifyToken } from './services/token-service'

/**
 * 服务端组件/路由读取当前登录用户（从 httpOnly 会话 Cookie 解析 JWT）。
 * 未登录返回 null；仅校验签名与有效期，不校验数据库会话（页面级读取使用）。
 */
export async function getCurrentUser(): Promise<{ id: number; username: string } | null> {
  try {
    const store = await cookies()
    const token = store.get('admin_session')?.value
    if (!token) return null
    const payload = await verifyToken(token)
    if (!payload?.userId) return null
    return { id: payload.userId, username: payload.username || '' }
  } catch {
    return null
  }
}

export async function getCurrentUserId(): Promise<number | null> {
  const user = await getCurrentUser()
  return user?.id ?? null
}
