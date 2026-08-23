import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { exportMemoryArchive } from '@/lib/modules/export/archive.service'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M2-E1：记忆档案导出（ZIP：JSON + Markdown + 原图）。
 * GET /api/export/archive → application/zip 下载
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const result = await exportMemoryArchive(auth.username)
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': String(result.buffer.length),
        'X-Export-Stats': JSON.stringify(result.stats),
      },
    })
  } catch (error) {
    console.error('[GET /api/export/archive]', error)
    return NextResponse.json({ error: '导出失败，请稍后重试' }, { status: 500 })
  }
}
