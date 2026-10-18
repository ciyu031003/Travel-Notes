import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAuth } from '@/lib/auth-middleware'
import { isSiteOwner } from '@/lib/site-owner'
import { logger } from '@/lib/infrastructure/logger'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import {
  validateVideoBuffer,
  MAX_VIDEO_SIZE,
  MAX_VIDEO_COUNT,
} from '@/lib/infrastructure/media-validation'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { enqueueTranscode, sweepAndEnqueue } from '@/lib/infrastructure/video-transcode'
import { TRANSCODE_MIN_SIZE } from '@/lib/infrastructure/video-upload-shared'
import { z } from 'zod'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'

/** 批量视频上传：multipart 表单，只校验 files 形状（魔数/大小由 media-validation 校验） */
const VideoUploadSchema = z.object({
  files: z
    .array(z.custom<File>((v) => v instanceof File, { message: '文件格式无效' }))
    .min(1, '未上传任何文件')
    .max(MAX_VIDEO_COUNT, `单次最多上传 ${MAX_VIDEO_COUNT} 个视频`),
})

/** 删除视频：只接受本地上传目录下的路径 */
const VideoDeleteSchema = z.object({
  url: z.string().min(1, '无效的文件路径').regex(/^\/uploads\/videos\//, '无效的文件路径'),
})

function getVideoDir(): string {
  const cwd = process.cwd()
  return path.join(cwd, 'public', 'uploads', 'videos')
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 读取文件头部若干字节用于 Magic Number 校验，避免整文件载入内存 */
async function readFileHeader(file: File, bytes = 4096): Promise<Buffer> {
  const slice = file.slice(0, bytes)
  return Buffer.from(await slice.arrayBuffer())
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // P0：站点级视频上传只允许站点主人（普通用户的旅行视频走 travel 媒体管线）
  if (!(await isSiteOwner(auth.payload?.userId))) {
    return NextResponse.json({ error: '当前角色无权执行该操作' }, { status: 403 })
  }

  try {
    // 上传限流：IP 每 15 分钟最多 60 次视频上传请求
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'video-upload:ip', key: ip || 'unknown', limit: 60, windowMs: 15 * 60 * 1000 })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '上传过于频繁，请稍后再试', retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      )
    }

    // P1-17：multipart 不套 parseBody(JSON)，按字段形状做 zod 校验
    const formData = await request.formData()
    const parsedForm = VideoUploadSchema.safeParse({ files: formData.getAll('files') })
    if (!parsedForm.success) {
      return errorResponse(
        new ApiError('VALIDATION_ERROR', parsedForm.error.issues[0]?.message || '未上传任何文件', 400),
        getRequestId(request),
      )
    }
    const files = parsedForm.data.files

    const videoDir = getVideoDir()
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true })
    }

    const results: Array<{
      url: string
      filename: string
      size: number
      duration?: string
      mimeType: string
    }> = []

    const timestamp = Date.now()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      logger.info('video-upload', 'processing', { name: file.name, type: file.type, size: file.size })

      if (file.size > MAX_VIDEO_SIZE) {
        return NextResponse.json(
          { error: `视频文件过大: ${file.name} 超过 ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)}MB` },
          { status: 400 }
        )
      }

      if (file.size === 0) {
        return NextResponse.json(
          { error: `文件为空: ${file.name}` },
          { status: 400 }
        )
      }

      // Magic Number 校验：不信任客户端 MIME
      let realMime: string
      try {
        const header = await readFileHeader(file)
        realMime = validateVideoBuffer(header, file.type || undefined)
      } catch (err: any) {
        return NextResponse.json(
          { error: `${file.name}: ${err.message}` },
          { status: 400 }
        )
      }

      const extMap: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/ogg': 'ogg',
      }

      const ext = extMap[realMime] || 'mp4'
      const filename = `${timestamp}-${i}-${randomUUID().slice(0, 8)}.${ext}`
      const filePath = path.join(videoDir, filename)

      const stream = file.stream()
      const readable = Readable.fromWeb(stream as any)
      const writeStream = fs.createWriteStream(filePath)

      await pipeline(readable, writeStream)

      const stat = fs.statSync(filePath)
      const url = `/uploads/videos/${filename}`

      results.push({
        url,
        filename,
        size: stat.size,
        mimeType: realMime,
      })

      logger.info('video-upload', 'saved', { url, size: stat.size })

      // 转码管线：大视频入队生成 720p 变体（后台执行，不阻塞响应）
      if (stat.size >= TRANSCODE_MIN_SIZE) {
        enqueueTranscode(filename)
      }
    }

    sweepAndEnqueue()

    writeAuditLog({
      username: auth.username || 'unknown',
      action: 'UPLOAD_MEDIA',
      resourceType: 'Video',
      ip,
      metadata: { count: results.length },
    }).catch(() => {})
    return NextResponse.json({
      success: true,
      videos: results,
    })
  } catch (error: any) {
    logger.error('video-upload', 'error', { message: error?.message, stack: error?.stack })
    return NextResponse.json(
      { error: error.message || '视频上传失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // P0：站点级视频上传只允许站点主人（普通用户的旅行视频走 travel 媒体管线）
  if (!(await isSiteOwner(auth.payload?.userId))) {
    return NextResponse.json({ error: '当前角色无权执行该操作' }, { status: 403 })
  }

  try {
    // P1-17：body 用 zod（只接受 /uploads/videos/ 前缀，防路径穿越/任意删文件）
    const { url } = await parseBody(request, VideoDeleteSchema)

    const videoDir = getVideoDir()
    const filePath = path.join(videoDir, path.basename(url))

    logger.info('video-upload', 'delete-start', { filePath })

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      logger.info('video-upload', 'deleted')
    } else {
      logger.warn('video-upload', 'delete-miss', { filePath })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    logger.error('video-upload', 'delete-error', { message: error?.message })
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    )
  }
}
