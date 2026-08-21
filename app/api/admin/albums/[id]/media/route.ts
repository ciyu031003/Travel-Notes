import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { addMediaToAlbum, removeMediaFromAlbum, canManageAlbum } from '@/lib/modules/album/album.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const albumId = parseInt(id, 10)
  if (isNaN(albumId)) {
    return NextResponse.json({ error: '无效的相册 ID' }, { status: 400 })
  }
  const owned = await canManageAlbum(albumId, auth.payload?.userId)
  if (!owned) return NextResponse.json({ error: '相册不存在或无权操作' }, { status: 404 })

  try {
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'album-upload:ip', key: ip || 'unknown', limit: 120, windowMs: 15 * 60 * 1000 })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '上传过于频繁，请稍后再试', retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    if (!files || files.length === 0) {
      return NextResponse.json({ error: '未上传任何文件' }, { status: 400 })
    }

    const imageFiles = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
      }))
    )

    const media = await addMediaToAlbum(albumId, imageFiles, auth.payload?.userId)
    writeAuditLog({
      username: auth.username,
      action: 'UPLOAD_MEDIA',
      resourceType: 'Album',
      resourceId: String(albumId),
      ip,
      metadata: { count: media.length },
    }).catch(() => {})
    return NextResponse.json({ success: true, media })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '上传失败' }, { status: 400 })
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
    return NextResponse.json({ error: '无效的相册 ID' }, { status: 400 })
  }
  const owned = await canManageAlbum(albumId, auth.payload?.userId)
  if (!owned) return NextResponse.json({ error: '相册不存在或无权操作' }, { status: 404 })
  try {
    const body = await request.json()
    const mediaId = parseInt(body?.mediaId, 10)
    if (isNaN(mediaId)) {
      return NextResponse.json({ error: '无效的媒体 ID' }, { status: 400 })
    }
    await removeMediaFromAlbum(albumId, mediaId)
    writeAuditLog({
      username: auth.username,
      action: 'DELETE_MEDIA',
      resourceType: 'Album',
      resourceId: String(albumId),
      metadata: { mediaId },
    }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
