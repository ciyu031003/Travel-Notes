import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { newUsername, currentPassword } = body

    if (!newUsername || !newUsername.trim()) {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 })
    }

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    const siteService = getSiteService()
    const result = await siteService.updateUsername(newUsername.trim(), currentPassword, authResult?.username)
    if (!result.success) {
      return NextResponse.json({ error: result.error || '更新失败' }, { status: 401 })
    }

    return NextResponse.json({ success: true, username: newUsername.trim() })
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
