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
    email: config.email,
    emailVerified: config.emailVerified,
  })
}

export async function DELETE(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(authResult.payload?.userId, 'canManageSettings')
  if (denied) return denied

  try {
    const body = await request.json()
    const { currentPassword } = body

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    const siteService = getSiteService()
    const result = await siteService.updateEmail(null, currentPassword, undefined, authResult?.username)
    if (!result.success) {
      return NextResponse.json({ error: result.error || '操作失败' }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}
