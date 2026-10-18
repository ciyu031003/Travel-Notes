import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { SettingsUpdateSchema } from '@/lib/api/schemas/admin'

export async function GET(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const siteService = getSiteService()
  const config = await siteService.getSiteConfig(authResult.username)
  return NextResponse.json({
    username: config.username,
    anniversaryStart: config.anniversaryStart,
  })
}

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // P0-3：这里只改「本人」的用户名/密码（均已校验当前密码），不要求站点主能力位
  try {
    // P1-17：body 统一 zod（currentPassword 必填，新用户名/新密码形状校验）
    const { currentPassword, newUsername, newPassword } = await parseBody(request, SettingsUpdateSchema)

    const siteService = getSiteService()

    if (newPassword && newPassword.trim()) {
      const result = await siteService.updatePassword(currentPassword, newPassword.trim(), authResult.username)
      if (!result.success) {
        return NextResponse.json({ error: result.error || '更新失败' }, { status: 401 })
      }
    }

    if (newUsername && newUsername.trim()) {
      const result = await siteService.updateUsername(newUsername.trim(), currentPassword, authResult.username)
      if (!result.success) {
        return NextResponse.json({ error: result.error || '更新失败' }, { status: 401 })
      }
      return NextResponse.json({ success: true, username: newUsername.trim() })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
