import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { updateAlbum, deleteAlbum, getAlbum } from '@/lib/modules/album/album.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { AlbumUpdateSchema, IdSchema } from '@/lib/api/schemas/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const idParsed = IdSchema.safeParse(id)
  if (!idParsed.success) {
    return errorResponse(new ApiError('INVALID_ID', '无效 ID', 400), getRequestId(request))
  }
  const albumId = idParsed.data
  const album = await getAlbum(albumId, auth.payload?.userId, auth.username)
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
  const idParsed = IdSchema.safeParse(id)
  if (!idParsed.success) {
    return errorResponse(new ApiError('INVALID_ID', '无效 ID', 400), getRequestId(request))
  }
  const albumId = idParsed.data
  try {
    // P1-17：更新 body 用 zod（字段可选，至少一项；title 非空）
    const body = await parseBody(request, AlbumUpdateSchema)
    const input: any = {}
    if (body.title !== undefined) input.title = body.title
    if (body.description !== undefined) input.description = body.description ? String(body.description) : null
    if (body.date !== undefined) input.date = body.date || null
    if (body.isPublic !== undefined) input.isPublic = Boolean(body.isPublic)
    if (body.travelId !== undefined) input.travelId = body.travelId ? Number(body.travelId) : null

    await updateAlbum(albumId, input)
    writeAuditLog({ username: auth.username, action: 'UPDATE', resourceType: 'Album', resourceId: String(albumId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
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
  const idParsed = IdSchema.safeParse(id)
  if (!idParsed.success) {
    return errorResponse(new ApiError('INVALID_ID', '无效 ID', 400), getRequestId(request))
  }
  const albumId = idParsed.data
  try {
    // reviewed-no-body-input: DELETE 无请求体，只校验路径 ID（上面 zod）
    // 仅允许操作「我可见且我是成员」的相册（空间 OWNER/MEMBER 也算；见 albumVisibilityWhere）
    const owned = await getAlbum(albumId, auth.payload?.userId, auth.username)
    if (!owned) {
      return NextResponse.json({ error: '相册不存在或无权操作' }, { status: 404 })
    }
    await deleteAlbum(albumId)
    writeAuditLog({ username: auth.username, action: 'DELETE', resourceType: 'Album', resourceId: String(albumId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
