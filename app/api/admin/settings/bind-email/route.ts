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

    const valid = verifyVerificationCode(email, code)
    if (!valid) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 401 })
    }

    consumeVerificationCode(email)

    const siteService = getSiteService()
    await siteService.updateEmail(email, undefined, true)

    return NextResponse.json({
      success: true,
      email,
      emailVerified: true,
    })
  } catch {
    return NextResponse.json({ error: '绑定失败' }, { status: 500 })
  }
}
