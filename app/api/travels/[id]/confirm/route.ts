import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'

export const dynamic = 'force-dynamic'

/**
 * 「完成并归档」：把进行中的旅行正式成册。
 *
 * 语义（对应真机需求"用户确认后就自动添加到旅行画册和最近旅行模块里面"）：
 *  · `confirmedAt` 为空 → 进行中草稿：首页给一个大入口继续补照片/行程/花销，
 *    但不进「最近旅行」与画册；
 *  · 确认后写入时间戳 → 立刻出现在最近旅行与画册里。
 *
 * 幂等：重复调用不会改动首次归档时间（用户回头再点一次不该让"归档日"漂移）。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const travelId = parseInt(id, 10)
  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) return guard.response

  const current = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { confirmedAt: true },
  })
  if (!current) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })

  const confirmedAt = current.confirmedAt ?? new Date()
  if (!current.confirmedAt) {
    await prisma.travel.update({ where: { id: travelId }, data: { confirmedAt }, select: { id: true } })
  }
  return NextResponse.json({ success: true, confirmedAt: confirmedAt.toISOString() })
}
