import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { canActOnContent } from '@/lib/modules/access'
import { validateAndSanitizeImage } from '@/lib/infrastructure/media-validation'
import { generateMediaVariants } from '@/lib/infrastructure/media-variants'
import { getStorageService } from '@/lib/infrastructure/storage'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * 给某条回忆上传照片（multipart，字段名 `files`）。
 *
 * 为什么需要新接口：已有的 `MemoryPhotoPicker` → `POST /api/memories/:id/media`
 * 只能**从相册里挑已存在的照片**关联，不能上传；而上传到相册的接口是
 * `/api/admin/albums/:id/media`（需要 album 且属于后台语义）。
 * 于是「新建旅行 → 传照片」这条最核心的路径在 App 里根本走不通。
 *
 * 行为与相册上传一致：校验图片 → 落存储 → 建 Media + 三种变体 → 关联到回忆。
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

  const storage = getStorageService()
  const createdIds: number[] = []
  const errors: string[] = []

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const safe = await validateAndSanitizeImage(buffer, file.type || 'image/jpeg')
      const ext = safe.mimeType.includes('png') ? 'png' : safe.mimeType.includes('webp') ? 'webp' : 'jpg'
      const key = `memories/${memoryId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
      const stored = await storage.upload(safe.buffer, key, safe.mimeType)

      const media = await prisma.media.create({
        data: {
          type: 'IMAGE',
          storageKey: key,
          mimeType: safe.mimeType,
          size: stored.size,
          width: safe.width,
          height: safe.height,
          visibility: 'SPACE',
          userId: auth.payload?.userId ?? null,
          spaceId: memory.spaceId,
        },
        select: { id: true },
      })

      // 变体：列表/画册用 THUMBNAIL/PREVIEW/BLUR；失败不阻断（下次访问按需生成）
      try {
        const variants = await generateMediaVariants(safe.buffer)
        for (const v of variants) {
          const variantKey = key.replace(/\.[a-z0-9]+$/i, '-' + v.variant.toLowerCase() + '.jpg')
          await storage.upload(v.buffer, variantKey, v.mimeType)
          await prisma.mediaVariant.create({
            data: {
              mediaId: media.id,
              variant: v.variant as never,
              storageKey: variantKey,
              width: v.width,
              height: v.height,
              size: v.size,
              mimeType: v.mimeType,
            },
          })
        }
      } catch (e) {
        console.error('[POST /api/memories/:id/photos] 变体生成失败:', (e as Error)?.message || e)
      }

      // 关联到回忆（多对多；一张照片可属于多个回忆）
      await prisma.memoryMedia
        .create({ data: { memoryId, mediaId: media.id, sortOrder: createdIds.length } })
        .catch(async () => {
          // 已关联过则忽略（唯一约束）
        })

      createdIds.push(media.id)
    } catch (e) {
      errors.push((e as Error)?.message || '上传失败')
    }
  }

  if (createdIds.length === 0) {
    return NextResponse.json({ error: errors[0] || '上传失败' }, { status: 400 })
  }
  return NextResponse.json({ success: true, mediaIds: createdIds, failed: errors.length }, { status: 201 })
}
