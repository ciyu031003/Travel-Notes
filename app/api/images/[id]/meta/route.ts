import { NextRequest } from 'next/server'
import { prismaImageRepository } from '@/lib/repositories/image-repository'
import { parseExif, type ExifData } from '@/lib/exif'
import { ok, fail, serverError, notFound } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// 简单内存缓存：EXIF 解析结果复用，避免重复读取大图字节
const cache = new Map<string, ExifData | null>()
const CACHE_MAX = 500

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params
    const id = parseInt(idParam, 10)
    if (isNaN(id)) {
      return fail('无效的图片 ID')
    }

    const cacheKey = `exif:${id}`
    if (cache.has(cacheKey)) {
      return ok({ exif: cache.get(cacheKey) })
    }

    const image = await prismaImageRepository.findById(id)
    if (!image) {
      return notFound('图片不存在')
    }

    let exif: ExifData | null = null
    if (
      image.mimeType === 'image/jpeg' ||
      image.mimeType === 'image/webp' ||
      image.mimeType.startsWith('image/')
    ) {
      try {
        exif = parseExif(image.data)
      } catch {
        exif = null
      }
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
