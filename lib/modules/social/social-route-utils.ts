import { NextRequest } from 'next/server'
import { requireAuth } from '../../auth-middleware'

/** 社交路由统一鉴权：返回当前登录用户 id，未登录返回 null */
export async function requireUserId(request: NextRequest): Promise<number | null> {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return null
  return auth.payload?.userId ?? null
}
