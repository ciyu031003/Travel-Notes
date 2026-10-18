import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { EmailUnbindSchema } from '@/lib/api/schemas/admin'

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
  // P0-3：解绑邮箱是「作用于本人」的操作（旧密码校验），不要求站点主能力位
  try {
    // P1-17：DELETE body 用 zod（解绑邮箱必须带当前密码）
    const { currentPassword } = await parseBody(request, EmailUnbindSchema)

    const siteService = getSiteService()
    const result = await siteService.updateEmail(null, currentPassword, undefined, authResult?.username)
    if (!result.success) {
      return NextResponse.json({ error: result.error || '操作失败' }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}
