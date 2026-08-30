import { NextRequest, NextResponse } from 'next/server'
import { getOilPainting } from '@/lib/modules/oil-paint/oil-paint.service'
import { getCurrentUserId } from '@/lib/current-user'
import { rateLimit } from '@/lib/infrastructure/rate-limit'

/**
 * 照片 → 油画版。仅接受本站相对路径(如 /uploads/…、/api/images/…)防止 SSRF。
 * 生成较慢(5-15s),前端对某张照片按需调用,结果缓存。
 * 双层防护：本路由做字符串级拦截(绝对URL/反斜杠/data:等一律拒绝)，
 * service.resolveImageUrl 再做同源强校验（防反斜杠/编码绕过）。
 * 付费外部 API：每用户限流 + 同图 in-flight 去重（service 层）。
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return NextResponse.json({ url: null }, { status: 401 })

    // 付费外部 API：每用户 10 次/分钟
    const rl = rateLimit({ prefix: 'oil:user', key: String(userId), limit: 10, windowMs: 60_000 })
    if (!rl.ok) {
      return NextResponse.json(
        { url: null, error: 'rate-limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    const url = new URL(request.url).searchParams.get('url') || ''
    const badUrl =
      !url ||
      url.includes('\\') ||
      url.startsWith('//') ||
      /^https?:\/\//i.test(url) ||
      /^(data|blob|file|ftp|javascript):/i.test(url)
    if (badUrl) {
      return NextResponse.json({ url: null, error: 'bad-url' }, { status: 400 })
    }

    const paintingUrl = await getOilPainting(url)
    return NextResponse.json({ url: paintingUrl })
  } catch (error) {
    console.error('[OilPaint API] 失败:', (error as Error)?.message || error)
    return NextResponse.json({ url: null }, { status: 500 })
  }
}
