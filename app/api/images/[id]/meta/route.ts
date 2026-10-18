import { NextRequest } from 'next/server'
import { prismaImageRepository } from '@/lib/repositories/image-repository'
import { parseExif, toPublicExif, type PublicExifData } from '@/lib/exif'
import { checkPostImageVisibility } from '../image-visibility'
import { ok, fail, serverError, notFound } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// 简单内存缓存：EXIF 解析结果复用，避免重复读取大图字节。
// 只缓存**白名单化之后**的数据（PublicExifData）：即便将来解析器新增字段，
// 也不会把 GPS / 设备序列号之类的隐私字段带出去（P0-4）。
const cache = new Map<string, PublicExifData | null>()
const CACHE_MAX = 500

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params
    const id = parseInt(idParam, 10)
    if (isNaN(id)) {
      return fail('无效的图片 ID')
    }

    const image = await prismaImageRepository.findById(id)
    if (!image) {
      return notFound('图片不存在')
    }

    // P0-4：与 /api/images/[id] 同一可见性口径 —— 草稿/私密文章的图，
    // 匿名与其他用户都拿不到（统一 404，不泄露存在性）
    const visibility = await checkPostImageVisibility(request, image.postId)
    if (!visibility.allowed) {
      return notFound('图片不存在')
    }

    const cacheKey = 'exif:' + id
    if (cache.has(cacheKey)) {
      return ok({ exif: cache.get(cacheKey) })
    }

    let exif: PublicExifData | null = null
    try {
      // 白名单化：只保留宽高 / 方向 / 拍摄时间，GPS 与设备序列号一律不下发
      exif = toPublicExif(parseExif(image.data))
    } catch {
      exif = null
    }

    if (cache.size >= CACHE_MAX) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    cache.set(cacheKey, exif)

    return ok({ exif })
  } catch (error: any) {
    console.error('[GET /api/images/[id]/meta] Error:', error?.message || error)
    return serverError()
  }
}
