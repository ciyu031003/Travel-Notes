import { NextResponse } from 'next/server'
import { listAlbums, getAlbum } from '@/lib/modules/album/album.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const albums = await listAlbums()
    return NextResponse.json({ albums })
  } catch (error: any) {
    console.error('[GET /api/albums] Error:', error?.message)
    return NextResponse.json({ albums: [] })
  }
}
