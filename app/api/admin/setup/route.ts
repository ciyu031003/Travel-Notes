import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth-utils'
import { getSiteSettings, updateCredentials } from '@/lib/auth'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'
import { PasswordSchema } from '@/lib/validators/auth.validator'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,50}$/

/** 初始化请求体（P1-12/P1-17）：用户名规则 + 与注册/重置/改密同一套密码策略 */
const SetupSchema = z.object({
  username: z.string().trim().regex(USERNAME_RE, '用户名需为 3-50 位字母、数字、下划线或中文'),
  password: PasswordSchema,
})

/**
 * 首次启动初始化：创建管理员账号。
 * - 仅当系统尚未配置任何密码时允许（初始化入口随完成自动关闭）
 * - 带 IP 限流，防止暴力占用初始化
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request)
  try {
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'setup:ip', key: ip || 'unknown', limit: 5, windowMs: 10 * 60 * 1000 })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '尝试过于频繁，请稍后再试', code: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds, requestId },
        { status: 429 }
      )
    }

    const { username, password } = await parseBody(request, SetupSchema)

    // 仅允许在未初始化时创建管理员
    const settings = await getSiteSettings()
    if (settings.passwordHash) {
      throw new ApiError('ALREADY_INITIALIZED', '系统已完成初始化，初始化入口已关闭', 409)
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
    if (error instanceof ApiError) {
      const res = errorResponse(error, requestId)
      res.headers.set('X-Request-Id', requestId)
      return res
    }
    console.error('[Setup] Error:', error?.message)
    const res = errorResponse(new ApiError('SETUP_FAILED', '初始化失败，请稍后重试', 500), requestId)
    res.headers.set('X-Request-Id', requestId)
    return res
  }
}
