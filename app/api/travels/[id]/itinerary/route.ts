import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { addItineraryItem, findTravelIdByDayId, canManageTravel } from '@/lib/modules/travel/travel.service'
import { canActOnContent } from '@/lib/modules/access'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * 前台「添加行程」：给某一天加一个景点 / 餐厅 / 住宿 / 交通 / 活动。
 *
 * 为什么新增前台接口而不是复用 `/api/admin/travels/:id/itinerary`：
 *  · 后者挂在 /admin 命名空间下，前台调用语义错误；
 *  · 它的 `:id` 实际不被使用（服务端按 dayId 反查旅行），却要求调用方传一个假 id。
 *
 * 权限与 `itinerary/[itemId]` 的 DELETE 一致：OWNER 或空间成员。
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
    const body = await request.json()
    const dayId = parseInt(body?.dayId, 10)
    const title = String(body?.title || '').trim()
    if (isNaN(dayId) || !title) {
      return NextResponse.json({ error: '参数不完整：dayId / title 必填' }, { status: 400 })
    }
    if (title.length > 120) {
      return NextResponse.json({ error: '名称过长（最多 120 字）' }, { status: 400 })
    }

    // dayId 必须属于路径里的这本旅行，避免跨旅行写入
    const ownerTravelId = await findTravelIdByDayId(dayId)
    if (!ownerTravelId || ownerTravelId !== travelId) {
      return NextResponse.json({ error: '这一天不属于该旅行' }, { status: 404 })
    }

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: { visibility: true, isPublic: true, ownerId: true, spaceId: true },
    })
    if (!travel) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
    if (!(await canActOnContent('Travel', travel, auth.payload?.userId))) {
      return NextResponse.json({ error: '无权编辑该旅行' }, { status: 403 })
    }

    const result = await addItineraryItem(dayId, {
      title,
      startTime: body?.startTime || undefined,
      endTime: body?.endTime || undefined,
      type: body?.type || 'SPOT',
      notes: body?.notes ? String(body.notes).slice(0, 500) : undefined,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error)?.message || '添加失败' },
      { status: 400 },
    )
  }
}
