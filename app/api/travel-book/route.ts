import { NextRequest, NextResponse } from 'next/server'
import { listTravelBooks } from '@/lib/modules/album/travel-book.service'
import { getCurrentUserId } from '@/lib/current-user'

/**
 * Travel Book（旅行画册 2.0）：以 Travel 模型聚合旅行故事。
 * 仅在用户登录时返回归属/公开的旅行画册；未登录为空的错误响应。
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const books = await listTravelBooks(userId)
    return NextResponse.json({ books })
  } catch (error) {
    console.error('[TravelBook API] Failed:', error)
    return NextResponse.json({ books: [] })
  }
}
