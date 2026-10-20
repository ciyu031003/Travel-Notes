import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getImageService } from '@/lib/container'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { getClientIp } from '@/lib/request-utils'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'
import { MediaAccessError } from '@/lib/services/image-service'
import { isSiteOwner } from '@/lib/site-owner'

/** 删除图片请求体（P1-17） */
const DeleteImageSchema = z.object({
  url: z.string().min(1, '缺少 url 参数'),
})

/**
 * 上传图片（multipart，P1-17：用 withAuth 统一 401/503/异常格式；文件内容由
 * media-validation 做魔数校验，不属于 JSON body schema）。
 */
export const POST = withAuth(async (request, ctx) => {
  // 上传限流：IP 每 15 分钟最多 120 次上传请求
  const ip = getClientIp(request)
  const limit = await rateLimitShared({ prefix: 'upload:ip', key: ip || 'unknown', limit: 120, windowMs: 15 * 60 * 1000 })
  if (!limit.ok) {
    throw new ApiError('RATE_LIMITED', '上传过于频繁，请稍后再试', 429)
  }

  const formData = await request.formData()
  const files = formData.getAll('files') as File[]
  const postIdStr = formData.get('postId') as string | null

  if (!files || files.length === 0) {
    throw new ApiError('NO_FILES', '未上传任何文件', 400)
  }
  if (!postIdStr) {
    throw new ApiError('MISSING_POST_ID', '缺少文章 ID，请先保存文章后再上传图片', 400)
  }
  const postId = parseInt(postIdStr, 10)
  if (isNaN(postId)) {
    throw new ApiError('INVALID_POST_ID', '无效的文章 ID', 400)
  }

  /**
   * P0-4：归属校验所需的执行者身份。
   *
   * 站点主人（站长）可管理全站图片；普通用户只能管理**自己文章**下的图片。
   * 判定放在服务层（image-service），这里只负责把身份传下去 —— 避免"路由忘了判权"重演。
   */
  const actor = { userId: ctx.userId ?? null, isSiteOwner: await isSiteOwner(ctx.userId) }

  const imageFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
    })),
  )

  try {
    const imageService = getImageService()
    const result = await imageService.upload(postId, imageFiles, actor)
    // 审计是旁路：失败要留痕，但不能让上传失败
    try {
      await writeAuditLog({
        username: ctx.username || 'unknown',
        action: 'UPLOAD_MEDIA',
        resourceType: 'PostImage',
        resourceId: String(postId),
        ip,
        metadata: { count: imageFiles.length },
      })
    } catch (auditError) {
      console.error('[Upload] 审计写入失败', { postId, auditError })
    }
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Upload] Error:', error?.message)
    if (error instanceof MediaAccessError) {
      // 无权与不存在同文案：403 + 统一提示，不给存在性探测
      throw new ApiError('FORBIDDEN', error.message, 403)
    }
    // 上传失败原因（格式不支持/过大等）是用户可据此修正的提示，保留原文
    throw new ApiError('UPLOAD_FAILED', error?.message || '上传失败', 500)
  }
})

export const DELETE = withAuth(async (request, ctx) => {
  const body = await parseBody(request, DeleteImageSchema)
  // P0-4：删除同样要判归属（原先任意登录用户可凭 URL 删任何人的图）
  const actor = { userId: ctx.userId ?? null, isSiteOwner: await isSiteOwner(ctx.userId) }
  try {
    const imageService = getImageService()
    await imageService.delete(body.url, actor)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Upload DELETE] Error:', error?.message)
    if (error?.message === '无效的资源路径' || error?.message === '无效的图片 ID') {
      throw new ApiError('INVALID_PATH', error.message, 400)
    }
    if (error instanceof MediaAccessError) {
      // 无权与不存在统一 404：两账号互删时互相探测不到
      throw new ApiError('NOT_FOUND', '图片不存在', 404)
    }
    if (error?.message === '图片不存在') {
      throw new ApiError('NOT_FOUND', error.message, 404)
    }
    throw new ApiError('DELETE_FAILED', error?.message || '删除失败', 500)
  }
})
