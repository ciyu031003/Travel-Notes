import { NextRequest, NextResponse } from 'next/server'
import { getOilPainting } from '@/lib/modules/oil-paint/oil-paint.service'
import { getCurrentUserId } from '@/lib/current-user'

/**
 * 照片 → 油画版。仅接受本站相对路径(如 /uploads/…、/api/images/…)防止 SSRF。
 * 生成较慢(5-15s),前端对某张照片按需调用,结果缓存。
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return NextResponse.json({ url: null }, { status: 401 })

    const url = new URL(request.url).searchParams.get('url') || ''
    if (!url || url.startsWith('//') || /^https?:\/\//i.test(url)) {
      return NextResponse.json({ url: null, error: 'bad-url' }, { status: 400 })
    }

    const paintingUrl = await getOilPainting(url)
    return NextResponse.json({ url: paintingUrl })
  } catch (error) {
    console.error('[OilPaint API] 失败:', (error as Error)?.message || error)
    return NextResponse.json({ url: null }, { status: 500 })
  }
}
