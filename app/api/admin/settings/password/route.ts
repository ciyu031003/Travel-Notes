import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { prismaSessionRepository } from '@/lib/repositories/session-repository'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少需要 6 位字符' }, { status: 400 })
    }

    if (newPassword === currentPassword) {
      return NextResponse.json({ error: '新密码不能与当前密码相同' }, { status: 400 })
    }

    const siteService = getSiteService()
    const result = await siteService.updatePassword(currentPassword, newPassword)
    if (!result.success) {
      return NextResponse.json({ error: result.error || '更新失败' }, { status: 401 })
    }

    // 密码变更后撤销其它会话，仅保留当前会话
    if (authResult.username && authResult.sessionId) {
      await prismaSessionRepository
        .revokeAllForUser(authResult.username, authResult.sessionId)
        .catch(() => {})
    }
    writeAuditLog({ username: authResult.username || 'unknown', action: 'CHANGE_PASSWORD' }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
