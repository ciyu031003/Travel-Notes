import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'
import { canActOnContent } from '@/lib/modules/access'
import { uploadPhotosToMemory } from '@/lib/modules/media/photo-upload'
import { parseIdParam } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/**
 * 给某条回忆上传照片（multipart，字段名 `files`）。
 *
 * 为什么需要新接口：已有的 `MemoryPhotoPicker` → `POST /api/memories/:id/media`
 * 只能**从相册里挑已存在的照片**关联，不能上传；而上传到相册的接口是
 * `/api/admin/albums/:id/media`（需要 album 且属于后台语义）。
 * 于是「新建旅行 → 传照片」这条最核心的路径在 App 里根本走不通。
 *
 * 落库管线见 `lib/modules/media/photo-upload.ts`（与旅行「相册」tab 共用一份）。
 *
 * P1-17 reviewed-no-body-input：multipart/form-data，无 JSON body；
 * 路径 id 用 zod 校验，文件数与图片合法性由 uploadPhotosToMemory 校验。
 */

const MAX_FILES = 9

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const memoryId = parseIdParam(id, '回忆 ID')

  const memory = await prisma.memory.findUnique({
    where: { id: memoryId },
    select: { id: true, spaceId: true, travelId: true },
  })
  if (!memory) throw new ApiError('NOT_FOUND', '回忆不存在', 404)

  // 权限：所属旅行的 OWNER/空间成员；无旅行的个人回忆则看空间成员
  let allowed = false
  if (memory.travelId) {
    const travel = await prisma.travel.findUnique({
      where: { id: memory.travelId },
      select: { visibility: true, isPublic: true, ownerId: true, spaceId: true },
    })
    allowed = !!travel && (await canActOnContent('Travel', travel, ctx.userId))
  }
  if (!allowed) {
    allowed = await prisma.spaceMember
      .findFirst({
        where: { spaceId: memory.spaceId, username: ctx.username, status: 'ACTIVE', role: { in: ['OWNER', 'MEMBER'] } },
        select: { id: true },
      })
      .then((r) => !!r)
      .catch(() => false)
  }
  if (!allowed) throw new ApiError('FORBIDDEN', '无权在该回忆下添加照片', 403)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new ApiError('INVALID_FORM', '请求格式无效', 400)
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) throw new ApiError('NO_FILES', '没有收到图片', 400)
  if (files.length > MAX_FILES) throw new ApiError('TOO_MANY_FILES', `单次最多 ${MAX_FILES} 张`, 400)

  const { mediaIds, errors } = await uploadPhotosToMemory(memoryId, files, {
    userId: ctx.userId,
    spaceId: memory.spaceId,
  })

  if (mediaIds.length === 0) {
    throw new ApiError('UPLOAD_FAILED', errors[0] || '上传失败', 400)
  }
  return NextResponse.json({ success: true, mediaIds, failed: errors.length }, { status: 201 })
})
