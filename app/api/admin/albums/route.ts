import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { listAlbums, createAlbum } from '@/lib/modules/album/album.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { AlbumCreateSchema } from '@/lib/api/schemas/admin'
import { readIdempotencyKey, withIdempotency } from '@/lib/api/idempotency'

// reviewed-no-body-input: GET 只读相册列表，无请求体
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const albums = await listAlbums(auth.payload?.userId, auth.username)
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
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  try {
    // P1-17：body 统一 zod 校验（标题必填/长度、可选字段类型），失败统一 VALIDATION_ERROR
    const body = await parseBody(request, AlbumCreateSchema)
    const title = body.title
    // B4：幂等 —— 离线队列重放的同一 Idempotency-Key 直接返回首次创建的 id
    const idem = await withIdempotency({
      key: readIdempotencyKey(request),
      userId: auth.payload?.userId,
      entityType: 'Album',
      run: async () => {
        const result = await createAlbum({
          title,
          description: body.description ? String(body.description) : undefined,
          date: body.date || undefined,
          userId: auth.payload?.userId,
          isPublic: Boolean(body.isPublic),
          travelId: body.travelId != null ? Number(body.travelId) : undefined,
        })
        return { entityId: result.id, value: null as null }
      },
    })
    if (!idem.replayed) {
      writeAuditLog({
        username: auth.username,
        action: 'CREATE',
        resourceType: 'Album',
        resourceId: String(idem.entityId),
        metadata: { title },
      }).catch(() => {})
    }
    return NextResponse.json({ success: true, id: idem.entityId }, { status: 201 })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
