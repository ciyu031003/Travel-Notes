import { NextRequest, NextResponse } from 'next/server'
import { findTravelIdByItineraryItemId, updateItineraryItem, deleteItineraryItem } from '@/lib/modules/travel/travel.service'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'

export const dynamic = 'force-dynamic'

/**
 * 修改 / 删除一个行程项。
 *
 * 为什么需要：前台此前**只有** `POST /api/travels/:id/itinerary`，行程加错了
 * 既删不掉也改不了 —— 用户只能眼睁睁看着错的条目留在时间线上。
 * 权限与新增一致；归属按 itemId 反查旅行，避免跨旅行改别人的行程。
 */
async function resolve(request: NextRequest, id: string, itemId: string) {
  const travelId = parseInt(id, 10)
  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) return { ok: false as const, response: guard.response }
  const iid = parseInt(itemId, 10)
  if (!Number.isFinite(iid)) {
    return { ok: false as const, response: NextResponse.json({ error: '无效的行程 ID' }, { status: 400 }) }
  }
  const ownerTravelId = await findTravelIdByItineraryItemId(iid)
  if (!ownerTravelId || ownerTravelId !== travelId) {
    return { ok: false as const, response: NextResponse.json({ error: '这条行程不属于该旅行' }, { status: 404 }) }
  }
  return { ok: true as const, itemId: iid }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const resolved = await resolve(request, id, itemId)
  if (!resolved.ok) return resolved.response
  try {
    const body = await request.json()
    await updateItineraryItem(resolved.itemId, {
      title: body?.title !== undefined ? String(body.title) : undefined,
      startTime: body?.startTime !== undefined ? (body.startTime ? String(body.startTime) : null) : undefined,
      endTime: body?.endTime !== undefined ? (body.endTime ? String(body.endTime) : null) : undefined,
      type: body?.type !== undefined ? String(body.type) : undefined,
      notes: body?.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || '保存失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const resolved = await resolve(request, id, itemId)
  if (!resolved.ok) return resolved.response
  try {
    await deleteItineraryItem(resolved.itemId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || '删除失败' }, { status: 400 })
  }
}
