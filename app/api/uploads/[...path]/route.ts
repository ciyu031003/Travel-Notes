import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { ensureLocalUrlVariants } from '@/lib/infrastructure/media-variants'

/**
 * 运行时文件服务：从本地磁盘按需读取 /uploads/** 资源（图片/视频）。
 *
 * Next.js 的 public/ 静态目录只会在构建/容器启动时预建文件清单，
 * 运行期新生成的图片变体（如按需生成的 -thumbnail/-preview/-blur.jpg）
 * 直接走 /uploads/xxx 会 404，必须重启容器才能访问。
 * 本路由在请求时从磁盘读取并返回，使运行期生成的变体立即可用。
 * 对「变体文件尚未生成」的情况，先按需生成（并发信号量保护）再返回，避免 404。
 */

function uploadDir(): string {
  return process.env.UPLOAD_DIR || 'public/uploads'
}

/** 变体文件未生成时，从变体路径反推出原图 URL（/uploads/<base>.<ext>）供按需生成。 */
const VARIANT_RE = /-(thumbnail|preview|blur)\.(jpg|jpeg|png|webp)$/i
function originalUploadUrlFromVariant(filePath: string): string | null {
  const m = VARIANT_RE.exec(path.basename(filePath))
  if (!m) return null
  const rel = path.relative(uploadDir(), filePath).split('\\').join('/')
  const stem = rel.replace(/-(thumbnail|preview|blur)(\.\w+)$/i, '$2')
  return '/uploads/' + stem
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ico': 'image/x-icon',
}

function safeResolve(segments: string[]): string | null {
  // 拒绝路径穿越：任何一段都不能是 .. 或包含 / 或 \\
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg.includes('/') || seg.includes('\\')) return null
  }
  const filePath = path.join(uploadDir(), ...segments)
  // 归一化后再校验一次，确保最终路径落在 uploadDir 之内
  const resolved = path.resolve(filePath)
  const root = path.resolve(uploadDir())
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params
  const filePath = safeResolve(segments)
  if (!filePath) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // 变体文件尚未生成：先按需生成（并发信号量保护），生成后立即服务，避免首访 404
  if (!fs.existsSync(filePath) && VARIANT_RE.test(path.basename(filePath))) {
    const origUrl = originalUploadUrlFromVariant(filePath)
    if (origUrl) {
      try {
        await ensureLocalUrlVariants(origUrl)
      } catch (e) {
        console.error('[uploads] on-demand variant generation failed', filePath, e)
      }
    }
  }

  try {
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) {
      return new NextResponse('Not Found', { status: 404 })
    }

    const ext = path.extname(filePath).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'

    const isImmutableVariant = /-(thumbnail|preview|blur)\.(jpg|jpeg|png|webp)$/.test(filePath)
    const headers = new Headers()
    headers.set('Content-Type', mime)
    headers.set('Content-Length', String(stat.size))
    headers.set('Accept-Ranges', 'bytes')
    headers.set('X-Content-Type-Options', 'nosniff')
    if (isImmutableVariant) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      headers.set('Cache-Control', 'public, max-age=86400')
    }

    const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream
    return new NextResponse(stream, { status: 200, headers })
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return new NextResponse('Not Found', { status: 404 })
    }
    console.error('[uploads] error serving', filePath, error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
