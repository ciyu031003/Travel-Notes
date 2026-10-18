import { NextRequest } from 'next/server'
import { getPhotoMessageService } from '@/lib/container'
import { ApiError, ok, fail, serverError } from '@/lib/api-response'
import { parseBody, withAuth } from '@/lib/api/handler'
import { toApiError } from '@/lib/api/schemas/common'
import { AddPhotoMessageSchema } from '@/lib/api/schemas/social'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const image = searchParams.get('image') || ''
    if (!image) {
      return fail('缺少 image 参数')
    }
    const { getCurrentUserId } = await import('@/lib/current-user')
    const userId = await getCurrentUserId()
    const service = getPhotoMessageService()
    const messages = await service.getMessages(image, userId)
    return ok(messages)
  } catch (error: any) {
    console.error('[GET /api/photo-messages] Error:', error?.message || error)
    return serverError()
  }
}

/**
 * 给照片留言。
 * P1-17：body 由 zod 校验（image 必填、content 1-500 字）；业务错误（过长/为空）保持 400。
 */
export const POST = withAuth(async (request, ctx) => {
  const body = await parseBody(request, AddPhotoMessageSchema)
  const service = getPhotoMessageService()
  try {
    const message = await service.addMessage(body.image, body.content, ctx.userId)
    return ok(message, '留言成功')
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (/过长|不能为空|图片标识/.test(msg)) throw toApiError(error, '留言失败')
    // 非业务异常：交给 withAuth 统一按 500 脱敏（不泄漏内部信息）
    throw error instanceof ApiError ? error : new Error('留言失败')
  }
})
