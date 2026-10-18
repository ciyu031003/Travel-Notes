import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { prismaSessionRepository } from '@/lib/repositories/session-repository'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { validatePassword } from '@/lib/validators/auth.validator'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // P0-3：改密是「作用于本人」的操作（旧密码 + 登录会话即可），
  // 不能要求 canManageSettings —— 否则普通用户永远改不了自己的密码。
  try {
    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    // 密码策略统一（P1-12）：此前这里是 6 位下限，绕过注册/重置的 8 位 + 弱口令策略
    const passwordCheck = validatePassword(newPassword)
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.message }, { status: 400 })
    }

    if (newPassword === currentPassword) {
      return NextResponse.json({ error: '新密码不能与当前密码相同' }, { status: 400 })
    }

    const siteService = getSiteService()
    const result = await siteService.updatePassword(currentPassword, newPassword, authResult?.username)
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
