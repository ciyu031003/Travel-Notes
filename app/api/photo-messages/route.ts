import { NextRequest } from 'next/server'
import { getPhotoMessageService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const image = typeof body.image === 'string' ? body.image : ''
    const content = typeof body.content === 'string' ? body.content : ''
    if (!image) {
      return fail('缺少图片标识')
    }
    if (!content.trim()) {
      return fail('留言内容不能为空')
    }
    const { getCurrentUserId } = await import('@/lib/current-user')
    const userId = await getCurrentUserId()
    const service = getPhotoMessageService()
    const message = await service.addMessage(image, content, userId)
    return ok(message, '留言成功')
  } catch (error: any) {
    console.error('[POST /api/photo-messages] Error:', error?.message || error)
    if (error?.message?.includes('过长') || error?.message?.includes('不能为空') || error?.message?.includes('图片标识')) {
      return fail(error.message)
    }
    return serverError()
  }
}
