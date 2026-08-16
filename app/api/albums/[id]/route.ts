import { NextResponse } from 'next/server'
import { getAlbum } from '@/lib/modules/album/album.service'
import { verifyAlbumToken, extractAlbumToken } from '@/lib/album-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = extractAlbumToken(request)
  if (!(await verifyAlbumToken(token))) {
    return NextResponse.json({ error: '相册已上锁，请先解锁' }, { status: 403 })
  }

  const { id } = await params
  const albumId = parseInt(id, 10)
  if (isNaN(albumId)) {
    return NextResponse.json({ error: '无效的相册 ID' }, { status: 400 })
  }
  try {
    const album = await getAlbum(albumId)
    if (!album) {
      return NextResponse.json({ error: '相册不存在' }, { status: 404 })
    }
    return NextResponse.json({ album })
  } catch (error: any) {
    console.error('[GET /api/albums/:id] Error:', error?.message)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}
