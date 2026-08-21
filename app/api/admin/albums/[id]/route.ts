import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { updateAlbum, deleteAlbum, getAlbum } from '@/lib/modules/album/album.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const albumId = parseInt(id, 10)
  if (isNaN(albumId)) {
    return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  }
  const album = await getAlbum(albumId, auth.payload?.userId)
  if (!album) {
    return NextResponse.json({ error: '相册不存在' }, { status: 404 })
  }
  return NextResponse.json({ album })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const albumId = parseInt(id, 10)
  if (isNaN(albumId)) {
    return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const input: any = {}
    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (!title) return NextResponse.json({ error: '请输入相册名称' }, { status: 400 })
      input.title = title
    }
    if (body.description !== undefined) input.description = body.description ? String(body.description) : null
    if (body.date !== undefined) input.date = body.date || null
    if (body.isPublic !== undefined) input.isPublic = Boolean(body.isPublic)

    await updateAlbum(albumId, input)
    writeAuditLog({ username: auth.username, action: 'UPDATE', resourceType: 'Album', resourceId: String(albumId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const albumId = parseInt(id, 10)
  if (isNaN(albumId)) {
    return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  }
  try {
    // 仅允许删除自己名下的相册
    const owned = await getAlbum(albumId, auth.payload?.userId)
    if (!owned) {
      return NextResponse.json({ error: '相册不存在或无权操作' }, { status: 404 })
    }
    await deleteAlbum(albumId)
    writeAuditLog({ username: auth.username, action: 'DELETE', resourceType: 'Album', resourceId: String(albumId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
