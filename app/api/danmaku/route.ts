import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { ok, fail, unauthorized } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth-middleware'
import { applyCacheControl } from '@/lib/http-cache'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

// 公开接口：获取全部弹幕（从最近到最早）
export async function GET() {
  try {
    const list = await prisma.danmaku.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const danmakus = list.map((d) => ({
      id: d.id.toString(),
      text: d.text,
      color: d.color,
      timestamp: d.createdAt.getTime(),
    }))

    const res = ok({ danmakus })
    return applyCacheControl(res, 'public', false)
  } catch (error: any) {
    console.error('[GET /api/danmaku] Error:', error?.message)
    return ok({ danmakus: [] })
  }
}

// 公开接口：写入一条新弹幕
export async function POST(request: NextRequest) {
  try {
    // 阶段 A · A6：公开写接口按 IP 限流，防止刷弹幕
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'danmaku:ip', key: ip || 'unknown', limit: 10, windowMs: 60_000 })
    if (!limit.ok) {
      return fail('发送过于频繁，请稍后再试', 429)
    }

    const body = await request.json()
    const text = (body?.text || '').toString().trim()
    if (!text) {
      return fail('留言内容不能为空', 400)
    }
    if (text.length > 50) {
      return fail('留言内容不能超过50字', 400)
    }

    const color = (body?.color || '#E4B478').toString()

    const created = await prisma.danmaku.create({
      data: {
        text,
        color,
      },
    })

    return ok({
      danmaku: {
        id: created.id.toString(),
        text: created.text,
        color: created.color,
        timestamp: created.createdAt.getTime(),
      },
    })
  } catch (error: any) {
    console.error('[POST /api/danmaku] Error:', error?.message)
    return fail(error.message || '发送失败', 500)
  }
}

// 需认证：删除一条弹幕
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = parseInt(searchParams.get('id') || '0', 10)
    if (!id) {
      return fail('缺少弹幕ID', 400)
    }

    await prisma.danmaku.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (error: any) {
    console.error('[DELETE /api/danmaku] Error:', error?.message)
    return fail(error.message || '删除失败', 500)
  }
}
