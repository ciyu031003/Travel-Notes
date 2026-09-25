/**
 * 图片上传落库管线（唯一实现）。
 *
 * 原先这段逻辑写在 `app/api/memories/[id]/photos/route.ts` 里；前台「相册」tab
 * 需要"把照片传到这本旅行"的能力，若各自再抄一份，校验/变体/关联三件事迟早漂移
 * （一边生成 BLUR 变体、另一边不生成，画册占位就会花掉）。
 *
 * 流程与相册上传一致：校验并净化图片 → 落存储 → 建 Media + 三种变体 → 关联到回忆。
 */
import { prisma } from '@/lib/db'
import { randomUUID } from 'crypto'
import { validateAndSanitizeImage } from '@/lib/infrastructure/media-validation'
import { generateMediaVariants } from '@/lib/infrastructure/media-variants'
import { getStorageService } from '@/lib/infrastructure/storage'

export interface PhotoUploadResult {
  mediaIds: number[]
  /** 逐张失败的原因（不中断整批） */
  errors: string[]
}

/**
 * 把一批图片文件上传并关联到指定回忆。
 * @param keyPrefix 存储前缀（memories / travels），仅影响对象键的可读性
 */
export async function uploadPhotosToMemory(
  memoryId: number,
  files: File[],
  meta: { userId?: number | null; spaceId: number | null; keyPrefix?: string },
): Promise<PhotoUploadResult> {
  const storage = getStorageService()
  const keyPrefix = meta.keyPrefix || 'memories'
  const mediaIds: number[] = []
  const errors: string[] = []

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const safe = await validateAndSanitizeImage(buffer, file.type || 'image/jpeg')
      const ext = safe.mimeType.includes('png') ? 'png' : safe.mimeType.includes('webp') ? 'webp' : 'jpg'
      const key = `${keyPrefix}/${memoryId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
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
          userId: meta.userId ?? null,
          spaceId: meta.spaceId,
          memoryId,
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
        console.error('[photo-upload] 变体生成失败:', (e as Error)?.message || e)
      }

      // 关联到回忆（多对多；一张照片可属于多个回忆）。已关联过则忽略（唯一约束）
      await prisma.memoryMedia
        .create({ data: { memoryId, mediaId: media.id, sortOrder: mediaIds.length } })
        .catch(() => {})

      mediaIds.push(media.id)
    } catch (e) {
      errors.push((e as Error)?.message || '上传失败')
    }
  }

  return { mediaIds, errors }
}
