import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { addMediaToAlbum, removeMediaFromAlbum, canManageAlbum } from '@/lib/modules/album/album.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'
import { z } from 'zod'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { AlbumMediaDeleteSchema, IdSchema } from '@/lib/api/schemas/admin'

/** 相册批量传图：multipart 表单，只校验 files 形状（文件内容由 media-validation 魔数校验） */
const AlbumMediaUploadSchema = z.object({
  files: z
    .array(z.custom<File>((v) => v instanceof File, { message: '文件格式无效' }))
    .min(1, '未上传任何文件'),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const idParsed = IdSchema.safeParse(id)
  if (!idParsed.success) {
    return errorResponse(new ApiError('INVALID_ID', '无效的相册 ID', 400), getRequestId(request))
  }
  const albumId = idParsed.data
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

    // P1-17：multipart 不套 parseBody(JSON)，按字段形状做 zod 校验
    const formData = await request.formData()
    const parsedForm = AlbumMediaUploadSchema.safeParse({ files: formData.getAll('files') })
    if (!parsedForm.success) {
      throw new ApiError('VALIDATION_ERROR', parsedForm.error.issues[0]?.message || '未上传任何文件', 400)
    }
    const files = parsedForm.data.files

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
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
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
  const idParsed = IdSchema.safeParse(id)
  if (!idParsed.success) {
    return errorResponse(new ApiError('INVALID_ID', '无效的相册 ID', 400), getRequestId(request))
  }
  const albumId = idParsed.data
  const owned = await canManageAlbum(albumId, auth.payload?.userId)
  if (!owned) return NextResponse.json({ error: '相册不存在或无权操作' }, { status: 404 })
  try {
    // P1-17：移除媒体 body 用 zod（mediaId 正整数）
    const body = await parseBody(request, AlbumMediaDeleteSchema)
    const mediaId = body.mediaId
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
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
