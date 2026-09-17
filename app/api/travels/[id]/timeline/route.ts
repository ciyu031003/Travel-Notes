import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { ensureTravelDays, getTravelTimeline } from '@/lib/modules/travel/travel.service'
import { canViewResourceById } from '@/lib/modules/access'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M1-A4：旅行按天叙事时间线。
 * GET /api/travels/[id]/timeline → { id, title, days: [{ date, title, summary, itinerary, memories, photos }] }
 * 权限（v3.1 M2-B1）：统一 access 中间层判读——owner / SPACE 空间成员 / PUBLIC 可读（修复原 scopedWhere 只认 ownerId 的缺口）。
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const travelId = parseInt(id, 10)
    if (isNaN(travelId)) {
      return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
    }
    const userId = await getCurrentUserId()
    if (!(await canViewResourceById('Travel', travelId, userId))) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
    }
    const timeline = await getTravelTimeline(travelId, userId)
    if (!timeline) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
    }
    // 存量旅行的惰性补齐：早先新建的旅行没有「天」，按天时间线在 0 天时不渲染，
    // 于是用户在详情页既看不到分天结构、也点不到「记一笔 / 添加行程」。
    // 这里按旅行日期区间补一次（已有天则不动）。
    if (timeline.days.length === 0) {
      const t = await prisma.travel.findUnique({
        where: { id: travelId },
        select: { startDate: true, endDate: true },
      })
      const created = await ensureTravelDays(
        travelId,
        t?.startDate ? t.startDate.toISOString() : null,
        t?.endDate ? t.endDate.toISOString() : null,
      ).catch(() => ({ created: 0 }))
      if (created.created > 0) {
        const again = await getTravelTimeline(travelId, userId)
        if (again) return NextResponse.json({ timeline: again })
      }
    }
    return NextResponse.json({ timeline })
  } catch (error) {
    console.error('[GET /api/travels/:id/timeline]', error)
    return NextResponse.json({ error: '获取时间线失败' }, { status: 500 })
  }
}
