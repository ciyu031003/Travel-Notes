import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { getTravelTimeline } from '@/lib/modules/travel/travel.service'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M1-A4：旅行按天叙事时间线。
 * GET /api/travels/[id]/timeline → { id, title, days: [{ date, title, summary, itinerary, memories, photos }] }
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const travelId = parseInt(id, 10)
    if (isNaN(travelId)) {
      return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
    }
    const userId = await getCurrentUserId()
    const timeline = await getTravelTimeline(travelId, userId)
    if (!timeline) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
    }
    return NextResponse.json({ timeline })
  } catch (error) {
    console.error('[GET /api/travels/:id/timeline]', error)
    return NextResponse.json({ error: '获取时间线失败' }, { status: 500 })
  }
}
