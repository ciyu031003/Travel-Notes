import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { getSiteService } from '@/lib/container'

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
  const denied = await requireCapability(authResult.payload?.userId, 'canManageSettings')
  if (denied) return denied

  try {
    const body = await request.json()
    const { currentPassword, newUsername, newPassword } = body

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

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
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
