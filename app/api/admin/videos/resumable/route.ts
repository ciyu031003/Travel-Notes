import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '@/lib/auth-middleware'
import { isSiteOwner } from '@/lib/site-owner'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { getClientIp } from '@/lib/request-utils'
import { validateVideoBuffer, MAX_VIDEO_SIZE } from '@/lib/infrastructure/media-validation'
import {
  RESUMABLE_CHUNK_SIZE,
  RESUMABLE_SESSION_TTL_MS,
  TRANSCODE_MIN_SIZE,
  isValidUploadId,
  totalChunksFor,
} from '@/lib/infrastructure/video-upload-shared'
import { enqueueTranscode, sweepAndEnqueue } from '@/lib/infrastructure/video-transcode'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { mediaTmpDir } from '@/lib/media/tmp-dir'
import { z } from 'zod'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'

/** uploadId 仅接受 UUID 形态（防路径穿越）；与 video-upload-shared.isValidUploadId 同一判定 */
const UploadIdSchema = z.string().refine(isValidUploadId, { message: '无效 uploadId' })

/** 分片上传（multipart）：只校验字段形状，范围（< totalChunks）在读 meta 后判定 */
const ResumableChunkFormSchema = z.object({
  uploadId: UploadIdSchema,
  index: z.coerce.number().int('分片索引越界').min(0, '分片索引越界'),
  chunk: z.custom<File>((v) => v instanceof File, { message: '分片为空' }).refine((f) => f.size > 0, { message: '分片为空' }),
})

/** JSON 动作：action 判别联合（init/status/complete/abort/transcode-status） */
const ResumableJsonSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('init'),
    filename: z.string().max(255).optional(),
    // size 由路由内按字节范围校验（需保留中文文案），这里只要求是数字/数字字符串
    size: z.union([z.number(), z.string()]).optional(),
    mimeType: z.string().max(100).optional(),
  }),
  z.object({ action: z.literal('status'), uploadId: UploadIdSchema }),
  z.object({ action: z.literal('complete'), uploadId: UploadIdSchema }),
  z.object({ action: z.literal('abort'), uploadId: UploadIdSchema }),
  z.object({ action: z.literal('transcode-status'), filename: z.string().max(255).optional() }),
])

export const dynamic = 'force-dynamic'

/**
 * 视频断点续传（五动作单路由，action 区分）：
 * - init     JSON  { filename, size, mimeType } → { uploadId, chunkSize, totalChunks }
 * - status   JSON  { uploadId } → { uploaded: number[], totalChunks }（断点续传先问状态再续片）
 * - chunk    FormData { uploadId, index, chunk: File } → { received: true }
 * - complete JSON  { uploadId } → { url, filename, size, mimeType, transcode }
 * - abort    JSON  { uploadId } → 清理临时目录
 * - transcode-status JSON { filename } → { status, url? }（编辑器轮询，完成后切变体）
 *
 * 安全：uploadId 仅接受 UUID 形态（防路径穿越）；分片索引越界拒绝；完整文件过 Magic Number 校验；
 * 临时目录 24h TTL，init 时顺带清理过期会话。
 */
const VIDEO_DIR = path.join(process.cwd(), 'public', 'uploads', 'videos')
// 分片临时目录（多副本准备）：MEDIA_TMP_DIR 可配，默认 os.tmpdir()。
// 多副本必须指向共享卷，否则「init 在副本 A、chunk 落到副本 B」会找不到会话目录。
// （COSFS 是对象存储语义：unlink 后目录列表有最终一致性延迟、rmdir 会 ENOTEMPTY，
//   所以默认仍放本地盘，只有拼装完成的成品才写 COS；共享卷由部署方按需指定。）
function tmpRoot(): string {
  return mediaTmpDir('tn-vuploads')
}

function tmpDirOf(uploadId: string): string {
  return path.join(tmpRoot(), uploadId)
}

interface SessionMeta {
  filename: string
  size: number
  mimeType: string
  chunkSize: number
  totalChunks: number
  createdAt: number
  username: string
}

function readMeta(uploadId: string): SessionMeta | null {
  try {
    const raw = fs.readFileSync(path.join(tmpDirOf(uploadId), 'meta.json'), 'utf8')
    return JSON.parse(raw) as SessionMeta
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
    if (!fs.existsSync(tmpRoot())) return
    const now = Date.now()
    for (const dir of fs.readdirSync(tmpRoot())) {
      const meta = readMeta(dir)
      if (meta && now - meta.createdAt > RESUMABLE_SESSION_TTL_MS) {
        fs.rmSync(path.join(tmpRoot(), dir), { recursive: true, force: true })
      }
    }
  } catch {
    // 清理失败不影响主流程
  }
}

function sanitizeBase(filename: string): string {
  return path.basename(filename).replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').slice(0, 120)
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // P0：站点级视频上传只允许站点主人
  if (!(await isSiteOwner(auth.payload?.userId))) {
    return NextResponse.json({ error: '当前角色无权执行该操作' }, { status: 403 })
  }

  const ip = getClientIp(request)
  const contentType = request.headers.get('content-type') || ''

  try {
    // ---------- 分片上传（multipart） ----------
    if (contentType.includes('multipart/form-data')) {
      const limit = await rateLimitShared({ prefix: 'vchunk:ip', key: ip || 'unknown', limit: 600, windowMs: 15 * 60 * 1000 })
      if (!limit.ok) {
        return NextResponse.json({ error: '上传过于频繁，请稍后再试' }, { status: 429 })
      }
      // P1-17：multipart 不套 parseBody(JSON)，按字段形状做 zod 校验
      const form = await request.formData()
      const parsedForm = ResumableChunkFormSchema.safeParse({
        uploadId: form.get('uploadId'),
        index: form.get('index'),
        chunk: form.get('chunk'),
      })
      if (!parsedForm.success) {
        return errorResponse(
          new ApiError('VALIDATION_ERROR', parsedForm.error.issues[0]?.message || '无效 uploadId', 400),
          getRequestId(request),
        )
      }
      const uploadId = parsedForm.data.uploadId
      const index = parsedForm.data.index
      const chunk = parsedForm.data.chunk
      const meta = readMeta(uploadId)
      if (!meta) return NextResponse.json({ error: '会话不存在或已过期，请重新上传' }, { status: 404 })
      if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
        return NextResponse.json({ error: '分片索引越界' }, { status: 400 })
      }
      if (!chunk || chunk.size === 0) {
        return NextResponse.json({ error: '分片为空' }, { status: 400 })
      }
      const dir = tmpDirOf(uploadId)
      fs.writeFileSync(path.join(dir, `${index}.part`), Buffer.from(await chunk.arrayBuffer()))
      return NextResponse.json({ received: true, index })
    }

    // ---------- JSON 动作 ----------
    // P1-17：action 用 zod 判别联合统一校验（uploadId 必须是合法 UUID）
    const body = await parseBody(request, ResumableJsonSchema)
    const action = body.action

    if (action === 'init') {
      const limit = await rateLimitShared({ prefix: 'vinit:ip', key: ip || 'unknown', limit: 60, windowMs: 15 * 60 * 1000 })
      if (!limit.ok) {
        return NextResponse.json({ error: '上传过于频繁，请稍后再试' }, { status: 429 })
      }
      const size = Number(body.action === 'init' ? body.size : NaN)
      const filename = sanitizeBase(String(body.action === 'init' ? body.filename || 'video' : 'video'))
      if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_SIZE) {
        return NextResponse.json(
          { error: `视频大小非法（需 0 < size ≤ ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)}MB）` },
          { status: 400 },
        )
      }
      cleanupStaleSessions()
      sweepAndEnqueue()
      fs.mkdirSync(tmpRoot(), { recursive: true })
      const uploadId = randomUUID()
      const meta: SessionMeta = {
        filename,
        size,
        mimeType: String(body.mimeType || 'video/mp4').slice(0, 100),
        chunkSize: RESUMABLE_CHUNK_SIZE,
        totalChunks: totalChunksFor(size),
        createdAt: Date.now(),
        username: auth.username || 'unknown',
      }
      fs.mkdirSync(tmpDirOf(uploadId), { recursive: true })
      fs.writeFileSync(path.join(tmpDirOf(uploadId), 'meta.json'), JSON.stringify(meta))
      return NextResponse.json({ uploadId, chunkSize: meta.chunkSize, totalChunks: meta.totalChunks })
    }

    if (action === 'status') {
      if (body.action !== 'status') return NextResponse.json({ error: '未知 action' }, { status: 400 })
      const meta = readMeta(body.uploadId)
      if (!meta) return NextResponse.json({ exists: false })
      return NextResponse.json({
        exists: true,
        totalChunks: meta.totalChunks,
        uploaded: uploadedChunks(body.uploadId, meta.totalChunks),
      })
    }

    if (action === 'complete') {
      if (body.action !== 'complete') return NextResponse.json({ error: '未知 action' }, { status: 400 })
      const meta = readMeta(body.uploadId)
      if (!meta) return NextResponse.json({ error: '会话不存在或已过期' }, { status: 404 })
      const dir = tmpDirOf(body.uploadId)
      const uploaded = uploadedChunks(body.uploadId, meta.totalChunks)
      if (uploaded.length !== meta.totalChunks) {
        return NextResponse.json(
          { error: `分片不完整（${uploaded.length}/${meta.totalChunks}）`, uploaded },
          { status: 400 },
        )
      }

      fs.mkdirSync(VIDEO_DIR, { recursive: true })
      const extMap: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogg' }
      const ext = extMap[meta.mimeType] || 'mp4'
      const finalName = `${Date.now()}-${sanitizeBase(meta.filename).replace(/\.(mp4|webm|ogg)$/i, '')}-${randomUUID().slice(0, 8)}.${ext}`
      const finalPath = path.join(VIDEO_DIR, finalName)

      // 顺序拼装 + Magic Number 校验（读头部，不整文件入内存）
      const write = fs.createWriteStream(finalPath)
      for (let i = 0; i < meta.totalChunks; i++) {
        const partPath = path.join(dir, `${i}.part`)
        await new Promise<void>((resolve, reject) => {
          const rs = fs.createReadStream(partPath)
          rs.on('error', reject)
          rs.on('end', resolve)
          rs.pipe(write, { end: false })
        })
      }
      await new Promise<void>((resolve) => write.end(resolve))

      let realMime = meta.mimeType
      try {
        const fd = fs.openSync(finalPath, 'r')
        const header = Buffer.alloc(4096)
        fs.readSync(fd, header, 0, 4096, 0)
        fs.closeSync(fd)
        realMime = validateVideoBuffer(header, meta.mimeType)
      } catch (err: any) {
        try { fs.unlinkSync(finalPath) } catch {}
        try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
        return NextResponse.json({ error: `文件校验失败: ${err.message}` }, { status: 400 })
      }

      try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {
        // 清理是尽力而为（本地盘）；残留会话由 init 的 24h TTL 清扫兜底
        console.warn('[Video Resumable] 临时目录清理失败:', (e as Error).message)
      }
      const stat = fs.statSync(finalPath)

      let transcode: 'queued' | 'skipped' = 'skipped'
      if (stat.size >= TRANSCODE_MIN_SIZE) {
        enqueueTranscode(finalName)
        transcode = 'queued'
      }

      writeAuditLog({
        username: auth.username || 'unknown',
        action: 'UPLOAD_MEDIA',
        resourceType: 'Video',
        resourceId: finalName,
        ip,
        metadata: { size: stat.size, resumable: true },
      }).catch(() => {})

      return NextResponse.json({
        url: `/uploads/videos/${finalName}`,
        filename: finalName,
        size: stat.size,
        mimeType: realMime,
        transcode,
      })
    }

    if (action === 'abort') {
      if (body.action !== 'abort') return NextResponse.json({ error: '未知 action' }, { status: 400 })
      fs.rmSync(tmpDirOf(body.uploadId), { recursive: true, force: true })
      return NextResponse.json({ aborted: true })
    }

    if (action === 'transcode-status') {
      const filename = path.basename(String(body.action === 'transcode-status' ? body.filename || '' : ''))
      if (!filename) return NextResponse.json({ status: 'none' })
      // 直接复用 transcode 模块的状态判定
      const { getTranscodeStatus } = await import('@/lib/infrastructure/video-transcode')
      return NextResponse.json(getTranscodeStatus(filename))
    }

    return NextResponse.json({ error: '未知 action' }, { status: 400 })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[Video Resumable] Error:', error?.message, error?.stack)
    return NextResponse.json({ error: error.message || '上传失败' }, { status: 500 })
  }
}
