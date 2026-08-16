import { NextResponse } from 'next/server'
import { listAlbums } from '@/lib/modules/album/album.service'
import { verifyAlbumToken, extractAlbumToken } from '@/lib/album-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = extractAlbumToken(request)
  if (!(await verifyAlbumToken(token))) {
    return NextResponse.json({ error: '相册已上锁，请先解锁' }, { status: 403 })
  }

  try {
    const albums = await listAlbums()
    return NextResponse.json({ albums })
  } catch (error: any) {
    console.error('[GET /api/albums] Error:', error?.message)
    return NextResponse.json({ albums: [] })
  }
}
