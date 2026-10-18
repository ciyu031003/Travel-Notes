import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { generateAlbumToken, ALBUM_COOKIE } from '@/lib/album-auth'
import { rateLimit, checkLoginLock, recordLoginFailure, clearLoginFailures } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

/**
 * 相册口令解锁（P0-5：补限流 + 失败指数退避）。
 *
 * 为什么必须补：口令来源是「纪念日日期」（低熵，常见日期几千种），而这条路由此前
 * 全文件无任何限流 —— 匿名在线枚举即可解锁相册。现在三层防护：
 *  ① IP 维度：15 分钟 10 次；
 *  ② 全局维度：15 分钟 30 次（挡住换 IP 的分布式爆破；单实例内存计数，多副本需切 Redis）；
 *  ③ 失败退避：key = album:<ip>，base 60s 指数翻倍、最长 30 分钟，成功即清零。
 *
 * 成功响应与 album_token 行为保持不变（P0-1 已保证该 token 不能当登录会话用）。
 */
const IP_WINDOW_MS = 15 * 60 * 1000
const IP_LIMIT = 10
const GLOBAL_WINDOW_MS = 15 * 60 * 1000
const GLOBAL_LIMIT = 30

// 与登录一致：连续失败后指数退避（记录次数本身即上锁，间隔 60s 起翻倍）
const LOCK_MAX_FAILURES = 5
const LOCK_BASE_MS = 60 * 1000
const LOCK_MAX_MS = 30 * 60 * 1000

function albumLockKey(ip: string | null): string {
  return 'album:' + (ip || 'unknown')
}

/** 统一 429：带 retryAfterSeconds 与 Retry-After 头，客户端可据此倒计时 */
function tooManyRequests(retryAfterSeconds: number, error = '尝试过于频繁，请稍后再试') {
  return NextResponse.json(
    { success: false, error, retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    // ① IP 维度窗口限流
    const ipLimit = rateLimit({ prefix: 'album:ip', key: ip || 'unknown', limit: IP_LIMIT, windowMs: IP_WINDOW_MS })
    if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfterSeconds)

    // ② 全局维度（低熵口令必须防换 IP 的分布式爆破）
    const globalLimit = rateLimit({ prefix: 'album:global', key: 'all', limit: GLOBAL_LIMIT, windowMs: GLOBAL_WINDOW_MS })
    if (!globalLimit.ok) return tooManyRequests(globalLimit.retryAfterSeconds)

    // ③ 失败退避锁：最近连续失败时直接拒绝，不再消耗口令尝试次数
    const lockKey = albumLockKey(ip)
    const lock = checkLoginLock(lockKey, { maxFailures: LOCK_MAX_FAILURES, baseLockMs: LOCK_BASE_MS, maxLockMs: LOCK_MAX_MS })
    if (lock.locked) return tooManyRequests(lock.retryAfterSeconds, '失败次数过多，请稍后再试')

    const body = await request.json()
    const inputDate = (body.date || '').trim()
    const skipRequested = body.skip === true

    if (!inputDate && !skipRequested) {
      return NextResponse.json({ success: false, error: '请输入日期' }, { status: 400 })
    }

    // 读取「当前登录用户」的纪念日（多用户：每个用户各自设置）
    // 未登录时（如登录页的相册解锁）回退到首个用户的纪念日
    const auth = await requireAuth(request as any)
    const username = auth.authenticated ? auth.username : undefined

    const siteService = getSiteService()
    const config = await siteService.getSiteConfig(username)
    let expectedDate = config.anniversaryStart

    // 兜底：账号设置里未设置时，用该用户最早的一条纪念日记录（纪念日管理里添加的）
    if (!expectedDate) {
      try {
        const anniversary = await prisma.anniversary.findFirst({
          where: auth.authenticated && auth.payload?.userId
            ? { OR: [{ userId: auth.payload.userId }, { userId: null }] }
            : {},
          orderBy: { date: 'asc' },
          select: { date: true },
        })
        if (anniversary) expectedDate = anniversary.date.toISOString().slice(0, 10)
      } catch {
        // 忽略，保持原错误提示
      }
    }

    if (!expectedDate) {
      // 多元场景：未设置纪念日（如独旅用户）时，直接放行解锁，不强制密码
      // 安全性不受影响：本来就无密码保护，放行只是跳过无意义的门槛
      clearLoginFailures(lockKey)
      const token = await generateAlbumToken('none')
      const response = NextResponse.json({ success: true, unlocked: true })
      response.cookies.set(ALBUM_COOKIE, token, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: 'lax',
      })
      return response
    }

    const normalize = (s: string) => s.replace(/[./年]/g, '-').replace(/[月]/g, '-').replace(/日/g, '').trim()
    const normalizedInput = normalize(inputDate)
    const normalizedExpected = normalize(expectedDate)

    const isValid =
      inputDate === expectedDate ||
      normalizedInput === normalizedExpected ||
      inputDate.replace(/-/g, '') === expectedDate.replace(/-/g, '')

    if (isValid) {
      clearLoginFailures(lockKey)
      const token = await generateAlbumToken(expectedDate)
      const response = NextResponse.json({ success: true })
      response.cookies.set(ALBUM_COOKIE, token, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: 'lax',
      })
      return response
    }

    // 失败：记一次失败并按次数退避（recordLoginFailure 返回本次锁定时长）
    const failure = recordLoginFailure(lockKey, { maxFailures: LOCK_MAX_FAILURES, baseLockMs: LOCK_BASE_MS, maxLockMs: LOCK_MAX_MS })
    return NextResponse.json(
      { success: false, error: '日期不正确', retryAfterSeconds: failure.retryAfterSeconds },
      { status: 401 },
    )
  } catch {
    return NextResponse.json({ success: false, error: '验证失败' }, { status: 500 })
  }
}
