import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { listAnniversaries } from '@/lib/modules/anniversary/anniversary.service'

export const dynamic = 'force-dynamic'

/**
 * 纪念日列表（P1-14）。
 *
 * 此前：不传 userId 调用 listAnniversaries()，scopedWhere(undefined) 返回 {} = 不限制，
 * 匿名请求能拿到全部纪念日的标题/日期/描述（评审 S-13）。
 * 现在：登录用户返回「自己的 + 公开的」，匿名只返回 isPublic 的。
 * 登录门的封条日期改走 /api/anniversaries/seal（只给 month/day）。
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId()
    const anniversaries = await listAnniversaries(userId)
    return NextResponse.json({ anniversaries })
  } catch (error: any) {
    console.error('[GET /api/anniversaries] Error:', error?.message)
    return NextResponse.json({ anniversaries: [] })
  }
}
