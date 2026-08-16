import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAuth } from '@/lib/auth-middleware'
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

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: '未上传任何文件' }, { status: 400 })
    }
    if (files.length > MAX_VIDEO_COUNT) {
      return NextResponse.json({ error: `单次最多上传 ${MAX_VIDEO_COUNT} 个视频` }, { status: 400 })
    }

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
      console.log('[Video Upload] Processing:', file.name, file.type, file.size)

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

      console.log('[Video Upload] Saved:', url, 'size:', stat.size)
    }

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
    console.error('[Video Upload] Error:', error?.message, error?.stack)
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

  try {
    const body = await request.json()
    const { url } = body

    if (!url || !url.startsWith('/uploads/videos/')) {
      return NextResponse.json({ error: '无效的文件路径' }, { status: 400 })
    }

    const videoDir = getVideoDir()
    const filePath = path.join(videoDir, path.basename(url))

    console.log('[Video DELETE] Deleting:', filePath)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log('[Video DELETE] Deleted successfully')
    } else {
      console.warn('[Video DELETE] File not found:', filePath)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Video DELETE] Error:', error?.message)
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    )
  }
}
