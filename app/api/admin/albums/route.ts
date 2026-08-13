import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { listAlbums, createAlbum } from '@/lib/modules/album/album.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const albums = await listAlbums()
    return NextResponse.json({ albums })
  } catch {
    return NextResponse.json({ albums: [] })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const title = String(body?.title || '').trim()
    if (!title) {
      return NextResponse.json({ error: '请输入相册名称' }, { status: 400 })
    }
    const result = await createAlbum({
      title,
      description: body?.description ? String(body.description) : undefined,
      date: body?.date || undefined,
    })
    writeAuditLog({
      username: auth.username,
      action: 'CREATE',
      resourceType: 'Album',
      resourceId: String(result.id),
      metadata: { title },
    }).catch(() => {})
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
