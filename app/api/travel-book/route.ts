import { NextRequest, NextResponse } from 'next/server'
import { listTravelBookSummaries, getTravelBookByKey } from '@/lib/modules/album/travel-book.service'
import { getCurrentUserId } from '@/lib/current-user'

/**
 * Travel Book（旅行画册 2.0）：以 Travel 模型 + 存量旅行文章聚合旅行故事。
 * 两级接口：
 *  - GET /api/travel-book            → 全部画册摘要（封面+统计，不含章节明细）
 *  - GET /api/travel-book?key=xxx    → 单本完整画册（bookKey: travel:{id} / city:{城市名}）
 *
 * 口径说明（刻意与 /api/album 不同）：画册展示的是公开/归属范围内的旅行故事照片，
 * 不受相册纪念日锁保护；相册锁只保护「纪念相册」（/api/album，私人照片墙）。
 * 数据可见性仍由 scopedWhere（归属/公开）过滤。
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const key = new URL(request.url).searchParams.get('key')
    if (key) {
      const book = await getTravelBookByKey(key, userId)
      if (!book) {
        return NextResponse.json({ error: '画册不存在' }, { status: 404 })
      }
      return NextResponse.json({ book })
    }
    const books = await listTravelBookSummaries(userId)
    return NextResponse.json({ books })
  } catch (error) {
    console.error('[TravelBook API] Failed:', error)
    return NextResponse.json({ error: '画册加载失败' }, { status: 500 })
  }
}
