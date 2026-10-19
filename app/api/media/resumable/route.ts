import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { canManageAlbum, addMediaToAlbum } from '@/lib/modules/album/album.service'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { RESUMABLE_CHUNK_BYTES, totalChunksForBytes } from '@/lib/media/upload-policy'

export const dynamic = 'force-dynamic'

/**
 * 图片分片上传（B5）：大图（>2MB）断网可续。
 *
 * 协议与视频分片（app/api/admin/videos/resumable）同构，但**面向普通用户**：
 *  · 归属校验：init 时校验 albumId 可管理（canManageAlbum），会话里记下 userId，
 *    chunk/complete 只认会话元数据，不接受客户端再传 albumId —— 防止"init 合法、
 *    complete 往别人相册塞图"；
 *  · 落库复用 addMediaToAlbum（与整图上传同一条管线：魔数校验/变体/关联/配额）；
 *  · 临时分片放 os.tmpdir()（容器本地盘；COSFS 上 rmdir 有最终一致性延迟）；
 *  · 会话 24h TTL，init 时顺带清扫过期目录。
 *
 * 动作：init / status / chunk(multipart) / complete / abort
 */

const IMAGE_MAX_BYTES = 20 * 1024 * 1024
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const TMP_ROOT = path.join(os.tmpdir(), 'tn-iuploads')

const UploadIdSchema = z.string().uuid('无效 uploadId')

const JsonSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('init'),
    albumId: z.coerce.number().int().positive('无效的相册 ID'),
    size: z.coerce.number().int().positive('图片大小非法'),
    mimeType: z.string().max(100).optional(),
    filename: z.string().max(255).optional(),
  }),
  z.object({ action: z.literal('status'), uploadId: UploadIdSchema }),
  z.object({ action: z.literal('complete'), uploadId: UploadIdSchema }),
  z.object({ action: z.literal('abort'), uploadId: UploadIdSchema }),
])

const ChunkFormSchema = z.object({
  uploadId: UploadIdSchema,
  index: z.coerce.number().int().min(0),
  chunk: z
    .custom<File>((v) => v instanceof File, { message: '分片为空' })
    .refine((f) => f.size > 0, { message: '分片为空' }),
})

interface SessionMeta {
  filename: string
  size: number
  mimeType: string
  chunkSize: number
  totalChunks: number
  albumId: number
  userId: number | null
  createdAt: number
}

function tmpDirOf(uploadId: string): string {
  return path.join(TMP_ROOT, uploadId)
}

function readMeta(uploadId: string): SessionMeta | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(tmpDirOf(uploadId), 'meta.json'), 'utf8')) as SessionMeta
  } catch {
    return null
  }
}

function uploadedChunks(uploadId: string, totalChunks: number): number[] {
  try {
    return fs
      .readdirSync(tmpDirOf(uploadId))
      .filter((n) => n.endsWith('.part'))
      .map((n) => parseInt(n.replace('.part', ''), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < totalChunks)
      .sort((a, b) => a - b)
  } catch {
    return []
  }
}

function cleanupStaleSessions(): void {
  try {
    if (!fs.existsSync(TMP_ROOT)) return
    const now = Date.now()
    for (const dir of fs.readdirSync(TMP_ROOT)) {
      const meta = readMeta(dir)
      if (meta && now - meta.createdAt > SESSION_TTL_MS) {
        fs.rmSync(path.join(TMP_ROOT, dir), { recursive: true, force: true })
      }
    }
  } catch {
    // 清理失败不影响主流程（下一次 init 会再试）
  }
}

function dropSession(uploadId: string): void {
  try {
    fs.rmSync(tmpDirOf(uploadId), { recursive: true, force: true })
  } catch {
    // 尽力而为；残留由 TTL 清扫
  }
}

function sanitizeBase(filename: string): string {
  return path.basename(filename).replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').slice(0, 120)
}

/** 会话归属校验：只允许创建者本人继续操作 */
function ownsSession(meta: SessionMeta, userId: number | null): boolean {
  if (meta.userId == null) return true // 历史/匿名会话（理论上不会出现）
  return userId != null && meta.userId === userId
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const userId = auth.payload?.userId ?? null
  const ip = getClientIp(request)
  const contentType = request.headers.get('content-type') || ''

  try {
    // ---------- 分片（multipart） ----------
    if (contentType.includes('multipart/form-data')) {
      const limit = rateLimit({ prefix: 'ichunk:ip', key: ip || 'unknown', limit: 900, windowMs: 15 * 60 * 1000 })
      if (!limit.ok) return NextResponse.json({ error: '上传过于频繁，请稍后再试' }, { status: 429 })

      const form = await request.formData()
      const parsed = ChunkFormSchema.safeParse({
        uploadId: form.get('uploadId'),
        index: form.get('index'),
        chunk: form.get('chunk'),
      })
      if (!parsed.success) {
        return errorResponse(
          new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message || '无效分片', 400),
          getRequestId(request),
        )
      }
      const { uploadId, index, chunk } = parsed.data
      const meta = readMeta(uploadId)
      if (!meta) return NextResponse.json({ error: '会话不存在或已过期，请重新上传' }, { status: 404 })
      if (!ownsSession(meta, userId)) return NextResponse.json({ error: '无权操作该上传会话' }, { status: 403 })
      if (index >= meta.totalChunks) return NextResponse.json({ error: '分片索引越界' }, { status: 400 })

      fs.writeFileSync(path.join(tmpDirOf(uploadId), index + '.part'), Buffer.from(await chunk.arrayBuffer()))
      return NextResponse.json({ received: true, index })
    }

    // ---------- JSON 动作 ----------
    const body = await parseBody(request, JsonSchema)

    if (body.action === 'init') {
      const limit = rateLimit({ prefix: 'iinit:ip', key: ip || 'unknown', limit: 120, windowMs: 15 * 60 * 1000 })
      if (!limit.ok) return NextResponse.json({ error: '上传过于频繁，请稍后再试' }, { status: 429 })

      if (body.size > IMAGE_MAX_BYTES) {
        return NextResponse.json(
          { error: '图片过大（需 ≤ ' + Math.round(IMAGE_MAX_BYTES / 1024 / 1024) + 'MB，请先压缩）' },
          { status: 400 },
        )
      }
      // 归属校验：只有能管理该相册的人才能往里传
      const denied = await requireCapability(userId, 'canManageContent')
      if (denied) return denied
      if (!(await canManageAlbum(body.albumId, userId))) {
        return NextResponse.json({ error: '相册不存在或无权操作' }, { status: 404 })
      }

      cleanupStaleSessions()
      fs.mkdirSync(TMP_ROOT, { recursive: true })
      const uploadId = randomUUID()
      const meta: SessionMeta = {
        filename: sanitizeBase(body.filename || 'photo.jpg'),
        size: body.size,
        mimeType: (body.mimeType || 'image/jpeg').slice(0, 100),
        chunkSize: RESUMABLE_CHUNK_BYTES,
        totalChunks: totalChunksForBytes(body.size),
        albumId: body.albumId,
        userId,
        createdAt: Date.now(),
      }
      fs.mkdirSync(tmpDirOf(uploadId), { recursive: true })
      fs.writeFileSync(path.join(tmpDirOf(uploadId), 'meta.json'), JSON.stringify(meta))
      return NextResponse.json({ uploadId, chunkSize: meta.chunkSize, totalChunks: meta.totalChunks })
    }

    if (body.action === 'status') {
      const meta = readMeta(body.uploadId)
      if (!meta) return NextResponse.json({ exists: false })
      if (!ownsSession(meta, userId)) return NextResponse.json({ error: '无权操作该上传会话' }, { status: 403 })
      return NextResponse.json({
        exists: true,
        totalChunks: meta.totalChunks,
        uploaded: uploadedChunks(body.uploadId, meta.totalChunks),
      })
    }

    if (body.action === 'abort') {
      const meta = readMeta(body.uploadId)
      if (meta && !ownsSession(meta, userId)) return NextResponse.json({ error: '无权操作该上传会话' }, { status: 403 })
      dropSession(body.uploadId)
      return NextResponse.json({ success: true })
    }

    // ---------- complete：拼装 → 交给相册媒体管线 ----------
    const meta = readMeta(body.uploadId)
    if (!meta) return NextResponse.json({ error: '会话不存在或已过期' }, { status: 404 })
    if (!ownsSession(meta, userId)) return NextResponse.json({ error: '无权操作该上传会话' }, { status: 403 })
    // 会话创建后权限可能被收回（例如被移出空间）：complete 前再校验一次
    if (!(await canManageAlbum(meta.albumId, userId))) {
      dropSession(body.uploadId)
      return NextResponse.json({ error: '相册不存在或无权操作' }, { status: 404 })
    }

    const uploaded = uploadedChunks(body.uploadId, meta.totalChunks)
    if (uploaded.length !== meta.totalChunks) {
      return NextResponse.json({ error: '分片不完整（' + uploaded.length + '/' + meta.totalChunks + '）', uploaded }, { status: 400 })
    }

    const assembled = path.join(tmpDirOf(body.uploadId), 'assembled.bin')
    const write = fs.createWriteStream(assembled)
    for (let i = 0; i < meta.totalChunks; i++) {
      const partPath = path.join(tmpDirOf(body.uploadId), i + '.part')
      await new Promise<void>((resolve, reject) => {
        const rs = fs.createReadStream(partPath)
        rs.on('error', reject)
        rs.on('end', resolve)
        rs.pipe(write, { end: false })
      })
    }
    await new Promise<void>((resolve, reject) => {
      write.end(() => resolve())
      write.on('error', reject)
    })

    const buffer = fs.readFileSync(assembled)
    if (buffer.length !== meta.size) {
      dropSession(body.uploadId)
      return NextResponse.json({ error: '拼装后大小不符（可能分片损坏），请重新上传' }, { status: 400 })
    }

    try {
      // 复用相册媒体管线：魔数校验 / 变体生成 / media 行 / album_media 关联 / 空间配额
      const media = await addMediaToAlbum(
        meta.albumId,
        [{ name: meta.filename, buffer, mimeType: meta.mimeType }],
        userId,
      )
      dropSession(body.uploadId)
      writeAuditLog({
        username: auth.username,
        action: 'UPLOAD_MEDIA',
        resourceType: 'Album',
        resourceId: String(meta.albumId),
        ip,
        metadata: { count: media.length, via: 'resumable', size: buffer.length },
      }).catch(() => {})
      return NextResponse.json({ success: true, media })
    } catch (e: unknown) {
      dropSession(body.uploadId)
      const msg = e instanceof Error ? e.message : '上传失败'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  } catch (error: unknown) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[media/resumable] 未预期错误:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: '上传失败' }, { status: 500 })
  }
}
