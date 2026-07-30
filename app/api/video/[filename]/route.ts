import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CHUNK_SIZE = 10 * 1024 * 1024

function getVideoDir(): string {
  const cwd = process.cwd()
  return path.join(cwd, 'public', 'uploads', 'videos')
}

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const videoDir = getVideoDir()
  const filePath = path.join(videoDir, filename)

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: '视频文件不存在' }, { status: 404 })
  }

  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const ext = path.extname(filename).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

  const rangeHeader = request.headers.get('Range')
  const responseHeaders: Record<string, string> = {
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=604800',
  }

  if (!rangeHeader) {
    responseHeaders['Content-Length'] = String(fileSize)
    responseHeaders['Content-Disposition'] = `inline; filename="${filename}"`
    
    const stream = fs.createReadStream(filePath)
    const webStream = Readable.toWeb(stream) as any
    return new NextResponse(webStream, {
      headers: responseHeaders,
      status: 200,
    })
  }

  const rangeMatch = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
  if (!rangeMatch) {
    return NextResponse.json(
      { error: '无效的 Range 请求' },
      { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } }
    )
  }

  let start = parseInt(rangeMatch[1], 10)
  let end = parseInt(rangeMatch[2], 10)

  if (isNaN(start)) {
    start = Math.max(0, fileSize - end)
    end = fileSize - 1
    responseHeaders['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
    responseHeaders['Content-Length'] = String(end - start + 1)
    
    const stream = fs.createReadStream(filePath, { start, end })
    const webStream = Readable.toWeb(stream) as any
    return new NextResponse(webStream, { headers: responseHeaders, status: 206 })
  }

  if (isNaN(end) || end >= fileSize) {
    end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1)
  }

  if (start >= fileSize) {
    responseHeaders['Content-Range'] = `bytes */${fileSize}`
    return NextResponse.json(
      { error: '请求范围不可满足' },
      { status: 416, headers: responseHeaders }
    )
  }

  responseHeaders['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
  responseHeaders['Content-Length'] = String(end - start + 1)

  const stream = fs.createReadStream(filePath, { start, end })
  const webStream = Readable.toWeb(stream) as any
  return new NextResponse(webStream, { headers: responseHeaders, status: 206 })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Allow': 'GET, HEAD, OPTIONS',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
    },
    status: 204,
  })
}
