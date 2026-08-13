import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getImageService } from '@/lib/container'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    // 上传限流：IP 每 15 分钟最多 120 次上传请求
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'upload:ip', key: ip || 'unknown', limit: 120, windowMs: 15 * 60 * 1000 })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '上传过于频繁，请稍后再试', retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const postIdStr = formData.get('postId') as string | null

    if (!files || files.length === 0) {
      return NextResponse.json({ error: '未上传任何文件' }, { status: 400 })
    }

    if (!postIdStr) {
      return NextResponse.json({ error: '缺少文章 ID，请先保存文章后再上传图片' }, { status: 400 })
    }

    const postId = parseInt(postIdStr, 10)
    if (isNaN(postId)) {
      return NextResponse.json({ error: '无效的文章 ID' }, { status: 400 })
    }

    const imageFiles = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
      }))
    )

    const imageService = getImageService()
    const result = await imageService.upload(postId, imageFiles)
    writeAuditLog({
      username: auth.username || 'unknown',
      action: 'UPLOAD_MEDIA',
      resourceType: 'PostImage',
      resourceId: String(postId),
      ip,
      metadata: { count: imageFiles.length },
    }).catch(() => {})
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Upload] Error:', error?.message)
    console.error('[Upload] Stack:', error?.stack)
    return NextResponse.json({ error: error.message || '上传失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 })
    }

    const imageService = getImageService()
    await imageService.delete(url)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Upload DELETE] Error:', error?.message)
    if (error.message === '无效的资源路径' || error.message === '无效的图片 ID') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error.message === '图片不存在') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}
