import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { getClientIp } from '@/lib/request-utils'

export const dynamic = 'force-dynamic'

/**
 * 最小客户端错误收集（P2-30）。
 *
 * 存在的理由：移动壳是静态导出，线上白屏/JS 报错此前**完全不可观测** ——
 * 仓库注释里多次出现"只能靠用户截图猜"。这里只做最小闭环：
 * 客户端 window.onerror / unhandledrejection → POST 本端点 → 服务端结构化 console.error。
 *
 * 刻意不写库：没有 MySQL 部署面也能用（符合当前环境），日志落在容器 stdout，
 * 由现有日志采集（docker logs / journald）承接；将来要落库再换实现，客户端不用改。
 *
 * 限流：每 IP 每分钟 20 条。客户端自己也会节流（每次会话最多 10 条），
 * 两层限流是为了防止开放端点被当成日志注入/刷量入口。
 */
const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(2000).optional(),
  appVersion: z.string().max(32).optional(),
  buildNumber: z.coerce.number().int().nonnegative().optional(),
})

export async function POST(request: NextRequest) {
  const ip = getClientIp(request) || 'unknown'
  const limited = await rateLimitShared({ prefix: 'diagnostics:ip', key: ip, limit: 20, windowMs: 60_000 })
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'too many reports' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const raw = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  // 单行结构化日志：便于 grep / 采集；stack 可能很长，交给采集侧截断
  console.error(
    '[client-error] ' +
      JSON.stringify({
        at: new Date().toISOString(),
        ip,
        ua: (request.headers.get('user-agent') || '').slice(0, 200),
        ...parsed.data,
      }),
  )

  return NextResponse.json({ ok: true })
}
