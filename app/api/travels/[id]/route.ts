import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { travelService } from '@/lib/modules/travel/space-travel.service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(_request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) {
    return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
  }
  try {
    const travel = await travelService.getTravel(auth.username, travelId)
    return NextResponse.json({ travel })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) {
    return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const travel = await travelService.updateTravel(auth.username, travelId, {
      title: body?.title,
      slug: body?.slug,
      description: body?.description,
      startDate: body?.startDate,
      endDate: body?.endDate,
      status: body?.status,
      visibility: body?.visibility,
      travelType: body?.travelType,
      companions: body?.companions,
    })
    return NextResponse.json({ success: true, travel })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) {
    return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
  }
  try {
    await travelService.deleteTravel(auth.username, travelId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const msg = error?.message || '删除失败'
    /**
     * 「旅行不存在」用 404 表达（此前统一 400）。
     *
     * 为什么重要：本地还留着行、但云端已经删掉的情况很常见
     * （用户删过一次、或先离线删后联网）。客户端据此把 404 当作
     * **"目标状态已达成"**处理并完成本地清理，而不是弹"删除失败"
     * 让用户反复点 —— 真机反馈「新建的几篇显示待同步、删除不了」即此。
     */
    return NextResponse.json({ error: msg }, { status: msg.includes('不存在') ? 404 : 400 })
  }
}
