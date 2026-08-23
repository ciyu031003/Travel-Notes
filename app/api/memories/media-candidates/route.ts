import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { scopedWhere } from '@/lib/visibility'
import { mediaPublicUrl } from '@/lib/modules/album/album.service'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M2-A2：回忆媒体候选列表（用户相册中的照片，供「给回忆关联照片」选择）。
 * GET /api/memories/media-candidates?limit=50
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '50', 10) || 50))
    const rows = await prisma.media.findMany({
      where: { ...scopedWhere(auth.payload?.userId) as any, type: 'IMAGE' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, storageKey: true, mimeType: true, width: true, height: true, memoryId: true },
    })
    return NextResponse.json({
      media: rows.map((m: any) => ({
        id: m.id,
        url: mediaPublicUrl(m.storageKey),
        mimeType: m.mimeType,
        width: m.width,
        height: m.height,
        primaryMemoryId: m.memoryId,
      })),
    })
  } catch (error) {
    console.error('[GET /api/memories/media-candidates]', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}
