import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkPostImageVisibility } from './image-visibility'

/**
 * 内容图读取（PostImage.data）。
 *
 * P0-4（S-5）：原实现按自增 id 直接返回字节，**没有任何可见性校验** ——
 * 顺序遍历 /api/images/1..N 就能拉走全部草稿图与私密文章图；响应还带
 * 「public, max-age=31536000, immutable」，一旦被 CDN/浏览器缓存，撤回可见性也收不回。
 *
 * 现在：
 *  · 仅「已发布且公开」的图可匿名读取，缓存 public, max-age=86400；
 *  · 作者本人 / 站点主人可读（草稿要能预览），但缓存 private, no-store；
 *  · 其余一律 404（与不存在同响应），不再对私有图发 immutable。
 */
function notFound(): NextResponse {
  return new NextResponse('Image not found', { status: 404 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const imageId = parseInt(id, 10)

    if (isNaN(imageId)) {
      return new NextResponse('Invalid image ID', { status: 400 })
    }

    const image = await prisma.postImage.findUnique({
      where: { id: imageId },
    })

    if (!image) return notFound()

    const visibility = await checkPostImageVisibility(request, image.postId)
    if (!visibility.allowed) return notFound()

    return new NextResponse(image.data, {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(image.data.length),
        'Cache-Control': visibility.publicRead ? 'public, max-age=86400' : 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[Image API] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
