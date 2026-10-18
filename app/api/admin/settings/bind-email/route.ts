import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { verifyVerificationCode, consumeVerificationCode } from '@/lib/verification'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { email, code } = body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: '请输入 6 位验证码' }, { status: 400 })
    }

    const valid = await verifyVerificationCode(email, code)
    if (!valid) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 401 })
    }

    await consumeVerificationCode(email)

    const siteService = getSiteService()
    // P0-3：必须传当前登录用户名 —— 不传时旧实现会回退「首个用户」，
    // 导致任意登录用户可以把邮箱绑到站长账号上（进而走忘记密码改站长密码）。
    const updateResult = await siteService.updateEmail(email, undefined, true, authResult.username)
    if (!updateResult.success) {
      return NextResponse.json({ error: updateResult.error || '绑定失败' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      email,
      emailVerified: true,
    })
  } catch {
    return NextResponse.json({ error: '绑定失败' }, { status: 500 })
  }
}
