import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { getSiteSettings } from '@/lib/auth'

export async function GET(request: Request) {
  const result = await requireAuth(request as any)
  if (!result.authenticated) {
    // 未登录时返回是否需要初始化（无管理员密码）
    let needsSetup = false
    try {
      const settings = await getSiteSettings()
      needsSetup = !settings.passwordHash
    } catch {}
    return NextResponse.json({ authenticated: false, needsSetup }, { status: 200 })
  }

  /**
   * P0-2/P0-3：`requirePasswordChange` 必须是**当前登录用户**的配置。
   * 旧实现走 authService.adminGetConfig() → userRepo.getSettings() → findFirst(id asc)，
   * 取的是全站第一个用户（站长）：普通用户登录后会被错误地要求改密，
   * 而站长自己的首登改密状态又可能被忽略。现在按 username 精确取本人配置。
   */
  const siteService = getSiteService()
  const config = await siteService.getSiteConfig(result.username)

  return NextResponse.json({
    authenticated: true,
    username: result.username,
    requirePasswordChange: config.requirePasswordChange,
  })
}
