import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { UsernameUpdateSchema } from '@/lib/api/schemas/admin'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // P0-3：改用户名是「作用于本人」的操作（旧密码校验），不要求站点主能力位
  try {
    // P1-17：body 统一 zod（用户名长度/字符集、当前密码必填）
    const { newUsername, currentPassword } = await parseBody(request, UsernameUpdateSchema)

    const siteService = getSiteService()
    const result = await siteService.updateUsername(newUsername, currentPassword, authResult?.username)
    if (!result.success) {
      return NextResponse.json({ error: result.error || '更新失败' }, { status: 401 })
    }

    return NextResponse.json({ success: true, username: newUsername })
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
