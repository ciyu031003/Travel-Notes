import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getPostService, getImageService } from '@/lib/container'
import { CreatePostSchema } from '@/lib/validators/post.validator'
import { ok, fail, unauthorized } from '@/lib/api-response'
import { z } from 'zod'

interface EmbeddedImageInput {
  name: string
  buffer: string
  mimeType: string
}

const PublishImportSchema = CreatePostSchema.extend({
  embeddedImages: z.array(z.object({
    name: z.string(),
    buffer: z.string(),
    mimeType: z.string(),
  })).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()

  try {
    const body = await request.json()
    const parsed = PublishImportSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return fail(
        firstError ? `${firstError.path.join('.')}: ${firstError.message}` : '输入参数错误',
        400
      )
    }

    const { embeddedImages, ...postInput } = parsed.data

    const postService = getPostService()
    const createResult = await postService.createPost({
      ...postInput,
      date: postInput.date ? new Date(postInput.date) : new Date(),
    })

    const postId = createResult.id

    if (embeddedImages && embeddedImages.length > 0) {
      const imageService = getImageService()
      const images = embeddedImages.map((img: EmbeddedImageInput) => ({
        name: img.name,
        buffer: Buffer.from(img.buffer, 'base64'),
        mimeType: img.mimeType,
      }))
      await imageService.upload(postId, images)
    }

    return ok({ id: postId }, '发布成功')
  } catch (error: any) {
    console.error('[Import Publish] Error:', error?.message)
    console.error('[Import Publish] Stack:', error?.stack)
    return fail(error.message || '发布失败', 500)
  }
}
