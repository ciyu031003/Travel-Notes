import { NextResponse } from 'next/server'
import { getSiteSettings, hashPassword, updateCredentials } from '@/lib/auth'
import { verifyResetCode, consumeResetCode } from '@/lib/verification'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, code, newPassword } = body

    if (!email || !code || code.length !== 6) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 })
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 位字符' }, { status: 400 })
    }

    const settings = await getSiteSettings()
    if (!settings.email || settings.email !== email) {
      return NextResponse.json({ error: '该邮箱未绑定账号' }, { status: 404 })
    }

    const valid = verifyResetCode(email, code)
    if (!valid) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 401 })
    }

    const passwordHash = await hashPassword(newPassword)
    await updateCredentials(settings.username, passwordHash, settings.email)

    consumeResetCode(email)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '重置失败' }, { status: 500 })
  }
}