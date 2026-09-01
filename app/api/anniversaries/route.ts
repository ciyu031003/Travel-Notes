import { NextResponse } from 'next/server'
import { listAnniversaries } from '@/lib/modules/anniversary/anniversary.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 注：登录门（LoginDoor）在未登录时取「最早纪念日」作为封条日期，属产品有意设计；
    // 该接口向匿名返回全部纪念日。如需收紧，应由产品确认后在登录门改为展示公开纪念日。
    const anniversaries = await listAnniversaries()
    return NextResponse.json({ anniversaries })
  } catch (error: any) {
    console.error('[GET /api/anniversaries] Error:', error?.message)
    return NextResponse.json({ anniversaries: [] })
  }
}
