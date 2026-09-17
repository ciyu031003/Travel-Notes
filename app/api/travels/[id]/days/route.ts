import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { addDay } from '@/lib/modules/travel/travel.service'
import { canActOnContent } from '@/lib/modules/access'

export const dynamic = 'force-dynamic'

/**
 * 前台「添加一天」：给旅行补一个「天」。
 *
 * 为什么需要：按天时间线是旅行记录的主结构，但前台一直没有加天的入口 ——
 * 用户若建旅行时没填日期，或想临时多记一天（出发前一夜、路上多待的一天），
 * 就完全没有办法。离线队列的 TRAVEL_DAY 也依赖这个接口落地。
 *
 * 权限与其它前台写接口一致：OWNER 或空间成员。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })

  try {
    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: { visibility: true, isPublic: true, ownerId: true, spaceId: true },
    })
    if (!travel) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
    if (!(await canActOnContent('Travel', travel, auth.payload?.userId))) {
      return NextResponse.json({ error: '无权编辑该旅行' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const date = typeof body?.date === 'string' && body.date ? body.date : undefined
    if (date && Number.isNaN(new Date(date).getTime())) {
      return NextResponse.json({ error: '日期格式不正确' }, { status: 400 })
    }

    const result = await addDay(travelId, {
      date,
      title: body?.title ? String(body.title).slice(0, 60) : undefined,
      summary: body?.summary ? String(body.summary).slice(0, 500) : undefined,
    })
    // 回传 id：离线队列靠它回填 remoteId，后续「记一笔」才能挂到这一天
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || '添加失败' }, { status: 400 })
  }
}
