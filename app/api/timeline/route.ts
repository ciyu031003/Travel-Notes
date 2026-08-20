import { NextRequest, NextResponse } from 'next/server'
import { getTimeline } from '@/lib/modules/timeline/timeline.service'
import { getCurrentUserId } from '@/lib/current-user'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const years = await getTimeline(userId)
    return NextResponse.json({ years })
  } catch (error) {
    console.error('[GET /api/timeline]', error)
    return NextResponse.json({ error: '获取时间线失败' }, { status: 500 })
  }
}
