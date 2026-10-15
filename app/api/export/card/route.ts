import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { buildTravelShareCard } from '@/lib/modules/export/share-card.service'

export const dynamic = 'force-dynamic'

/**
 * 旅行分享卡片导出（2026-10-15）。
 * GET /api/export/card?slug=xxx → 自包含 HTML（text/html）
 *
 * 为什么用 inline 而不是 attachment：用户既可能"打开看"也可能"另存为"，
 * inline + Content-Disposition 带文件名，浏览器/WebView 会按用户选择处理；
 * 直接 attachment 会强制下载，在手机上反而看不出效果。
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const slug = request.nextUrl.searchParams.get('slug') || ''
  if (!slug) return NextResponse.json({ error: '缺少 slug' }, { status: 400 })
  try {
    const { html, filename } = await buildTravelShareCard(slug)
    // 文件名含中文，HTTP header 只能是 latin1 —— 用 RFC 5987 的 filename* 传
    const ascii = filename.replace(/[^\x20-\x7E]/g, "_")
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[GET /api/export/card]', error)
    const msg = error instanceof Error ? error.message : '导出失败'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
