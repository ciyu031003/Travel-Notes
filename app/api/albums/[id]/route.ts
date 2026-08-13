import { NextResponse } from 'next/server'
import { getAlbum } from '@/lib/modules/album/album.service'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
