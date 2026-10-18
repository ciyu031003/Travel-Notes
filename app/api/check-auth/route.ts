import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getAuthService } from '@/lib/container'
import { sessionCookieOptions } from '@/lib/auth-utils'
import { isAppClientRequest } from '@/lib/request-utils'
import { APP_SESSION_SECONDS, APP_SESSION_RENEW_BEFORE_SECONDS } from '@/lib/services/auth-service'

export const dynamic = 'force-dynamic'

/**
 * 登录态探测 + App 会话静默续期（P1-10）。
 *
 * 背景：App 登录会话 TTL 从 365 天收紧到 90 天后，若不续期，用户每 90 天被踢出一次
 * （真机体验不可接受）。这里在**会话仍然有效**且剩余 < 30 天时，用同一 sid
 * 重签 JWT 并 Set-Cookie，同时延长数据库会话有效期 —— 客户端无感，撤销语义不变。
 *
 * 仅对 App 客户端续期（Web 会话 5h/7d，不需要也不应该被延长到 90 天）；
 * 客户端判定见 lib/request-utils.ts:isAppClientRequest（无请求体的 GET 无法读 clientType，
 * 用 Origin/X-Client-Type/查询参数识别 Capacitor 壳）。
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request as any)
  if (!auth.authenticated) {
    // 数据库不可用是「暂时无法判断」而不是「未登录」：返回 503，避免客户端误清登录态
    if (auth.databaseUnavailable) {
      return NextResponse.json({ authenticated: false, error: '服务暂时不可用' }, { status: 503 })
    }
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }

  const response = NextResponse.json({ authenticated: true, username: auth.username })

  const sid = auth.payload?.sid
  const exp = typeof auth.payload?.exp === 'number' ? auth.payload.exp : 0
  const remainingMs = exp * 1000 - Date.now()
  const appClient = isAppClientRequest(request)

  if (appClient && sid && remainingMs > 0 && remainingMs < APP_SESSION_RENEW_BEFORE_SECONDS * 1000) {
    try {
      const token = await getAuthService().renewSession(sid, APP_SESSION_SECONDS)
      if (token) {
        // Cookie 属性与 app/api/login/route.ts 的 App 分支完全一致（SameSite=None + Secure）
        response.cookies.set('admin_session', token, sessionCookieOptions('app', APP_SESSION_SECONDS))
        response.headers.set('X-Session-Renewed', '1')
      }
    } catch (error) {
      // 续期失败不影响本次登录态判定（本次请求已通过认证），下次 check-auth 再试
      console.error('[GET /api/check-auth] App 会话续期失败:', (error as Error)?.message || error)
    }
  }

  return response
}
