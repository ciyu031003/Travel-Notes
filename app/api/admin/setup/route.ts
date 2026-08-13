import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth-utils'
import { getSiteSettings, updateCredentials } from '@/lib/auth'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,50}$/

/**
 * 首次启动初始化：创建管理员账号。
 * - 仅当系统尚未配置任何密码时允许（初始化入口随完成自动关闭）
 * - 带 IP 限流，防止暴力占用初始化
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'setup:ip', key: ip || 'unknown', limit: 5, windowMs: 10 * 60 * 1000 })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '尝试过于频繁，请稍后再试', retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const body = await request.json()
    const username = String(body?.username || '').trim()
    const password = String(body?.password || '')

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: '用户名需为 3-50 位字母、数字、下划线或中文' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json({ error: '密码至少需要 8 位字符' }, { status: 400 })
    }
    if (password.length > 128) {
      return NextResponse.json({ error: '密码长度不能超过 128 位' }, { status: 400 })
    }

    // 仅允许在未初始化时创建管理员
    const settings = await getSiteSettings()
    if (settings.passwordHash) {
      return NextResponse.json({ error: '系统已完成初始化，初始化入口已关闭' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const existing = await prisma.siteSetting.findFirst({ orderBy: { id: 'asc' } })

    if (existing) {
      await prisma.siteSetting.update({
        where: { id: existing.id },
        data: { username, passwordHash, requirePasswordChange: false },
      })
    } else {
      await prisma.siteSetting.create({
        data: { username, passwordHash, requirePasswordChange: false },
      })
    }

    // 使缓存失效，让登录立刻可用
    await updateCredentials(username, passwordHash, null, true).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Setup] Error:', error?.message)
    return NextResponse.json({ error: '初始化失败，请稍后重试' }, { status: 500 })
  }
}
