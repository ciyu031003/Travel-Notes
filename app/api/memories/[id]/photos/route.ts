import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { canActOnContent } from '@/lib/modules/access'
import { uploadPhotosToMemory } from '@/lib/modules/media/photo-upload'

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
 */

const MAX_FILES = 9

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  const memoryId = parseInt(id, 10)
  if (isNaN(memoryId)) return NextResponse.json({ error: '无效的回忆 ID' }, { status: 400 })

  const memory = await prisma.memory.findUnique({
    where: { id: memoryId },
    select: { id: true, spaceId: true, travelId: true },
  })
  if (!memory) return NextResponse.json({ error: '回忆不存在' }, { status: 404 })

  // 权限：所属旅行的 OWNER/空间成员；无旅行的个人回忆则看空间成员
  let allowed = false
  if (memory.travelId) {
    const travel = await prisma.travel.findUnique({
      where: { id: memory.travelId },
      select: { visibility: true, isPublic: true, ownerId: true, spaceId: true },
    })
    allowed = !!travel && (await canActOnContent('Travel', travel, auth.payload?.userId))
  }
  if (!allowed) {
    allowed = await prisma.spaceMember
      .findFirst({
        where: { spaceId: memory.spaceId, username: auth.username, status: 'ACTIVE', role: { in: ['OWNER', 'MEMBER'] } },
        select: { id: true },
      })
      .then((r) => !!r)
      .catch(() => false)
  }
  if (!allowed) return NextResponse.json({ error: '无权在该回忆下添加照片' }, { status: 403 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: '请求格式无效' }, { status: 400 })
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: '没有收到图片' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `单次最多 ${MAX_FILES} 张` }, { status: 400 })

  const { mediaIds, errors } = await uploadPhotosToMemory(memoryId, files, {
    userId: auth.payload?.userId,
    spaceId: memory.spaceId,
  })

  if (mediaIds.length === 0) {
    return NextResponse.json({ error: errors[0] || '上传失败' }, { status: 400 })
  }
  return NextResponse.json({ success: true, mediaIds, failed: errors.length }, { status: 201 })
}
