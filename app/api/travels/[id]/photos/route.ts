import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api-response'
import { ensureTravelDays } from '@/lib/modules/travel/travel.service'
import { uploadPhotosToMemory } from '@/lib/modules/media/photo-upload'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'
import { memoryService } from '@/lib/modules/memory/memory.service'
import { spaceService } from '@/lib/modules/space/space.service'
import { asApiErrorFromResponse, IdSchema, parseIdParam, withRouteErrors } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

const MAX_FILES = 9
/** 相册上传的容器回忆标题：同一天再传复用同一条，避免时间线上堆一串空标题回忆 */
const PHOTO_MEMORY_TITLE = '旅行照片'

/**
 * 把照片上传到某本旅行（前台「相册」tab 的上传入口）。
 *
 * 数据模型约束：`Media` 没有 travelId，照片必须挂在一条 `Memory` 上才能被
 * 时间线 / 画册 / 封面统计看见。所以这里为「某一天」惰性创建一条约定标题的
 * 容器回忆（`旅行照片`），同一天重复上传复用它。
 *
 * 可选 `travelDayId`（form 字段）：不传则落到第一天（没有天就先按旅行区间补出来，
 * 与 `/memories` 的兜底一致），保证「新建完旅行 → 立刻传照片」不会因为 0 天而失败。
 *
 * P1-17 reviewed-no-body-input：multipart/form-data，无 JSON body；
 * 路径 id 与 form.travelDayId 用 zod 校验，文件数与图片合法性由 uploadPhotosToMemory 校验。
 */
export const POST = withRouteErrors(async (request, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')
  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) throw await asApiErrorFromResponse(guard.response)
  const { username, userId, travel } = guard.ctx

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new ApiError('INVALID_FORM', '请求格式无效', 400)
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) throw new ApiError('NO_FILES', '没有收到图片', 400)
  if (files.length > MAX_FILES) throw new ApiError('TOO_MANY_FILES', `单次最多 ${MAX_FILES} 张`, 400)

  // ① 定位「天」
  let day = null as { id: number; date: Date | null } | null
  const rawDayId = form.get('travelDayId')
  if (rawDayId != null && String(rawDayId) !== '' && String(rawDayId) !== 'null') {
    const dayId = IdSchema.safeParse(String(rawDayId))
    if (!dayId.success) throw new ApiError('INVALID_ID', '无效的天 ID', 400)
    day = await prisma.travelDay.findFirst({ where: { id: dayId.data, travelId }, select: { id: true, date: true } })
    if (!day) throw new ApiError('INVALID_DAY', '这一天不属于该旅行', 400)
  } else {
    day = await prisma.travelDay.findFirst({
      where: { travelId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, date: true },
    })
    if (!day) {
      await ensureTravelDays(
        travelId,
        travel.startDate ? travel.startDate.toISOString() : null,
        travel.endDate ? travel.endDate.toISOString() : null,
      ).catch(() => ({ created: 0 }))
      day = await prisma.travelDay.findFirst({
        where: { travelId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, date: true },
      })
    }
    if (!day) throw new ApiError('NO_DAY', '这本旅行还没有可用的「天」，请先补充日期', 400)
  }

  // ② 复用或创建容器回忆。Memory.spaceId 必填：个人旅行自动落到个人空间。
  let spaceId = travel.spaceId
  if (!spaceId) {
    try {
      spaceId = await spaceService.ensurePersonalSpace(username, userId)
    } catch (e) {
      console.error('[POST /api/travels/:id/photos] ensurePersonalSpace failed:', (e as Error)?.message || e)
      throw new ApiError('PERSONAL_SPACE_FAILED', '无法创建个人空间，请稍后重试', 500)
    }
  }

  let memory = await prisma.memory.findFirst({
    where: { travelId, travelDayId: day.id, title: PHOTO_MEMORY_TITLE },
    select: { id: true, spaceId: true },
  })
  if (!memory) {
    const created = await memoryService.createMemory(username, {
      spaceId,
      travelId,
      travelDayId: day.id,
      title: PHOTO_MEMORY_TITLE,
      content: null,
      mood: null,
      // 落到该天：happenedAt 不取"现在"，否则照片会归到错误的章节
      happenedAt: (day.date ?? new Date()).toISOString(),
      visibility: 'SPACE',
    })
    memory = { id: created.id, spaceId }
  }

  // ③ 上传（管线与「记一笔」传照片共用）
  const { mediaIds, errors } = await uploadPhotosToMemory(memory.id, files, {
    userId,
    spaceId: memory.spaceId,
    keyPrefix: 'travels',
  })
  if (mediaIds.length === 0) {
    throw new ApiError('UPLOAD_FAILED', errors[0] || '上传失败', 400)
  }
  return NextResponse.json(
    { success: true, mediaIds, memoryId: memory.id, travelDayId: day.id, failed: errors.length },
    { status: 201 },
  )
})
