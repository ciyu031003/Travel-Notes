import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import stream from 'node:stream'
import { NextRequest } from 'next/server'

// 旧 /api/video/[filename] 路由已删除（视频统一由 /api/uploads/[...path] 服务），
// 路径穿越与 Range 防护测试随之移植到现役路由。

import { GET as GET_UPLOADS } from '@/app/api/uploads/[...path]/route'

async function callGET(segments: string[], headers: Record<string, string> = {}) {
  const req = new NextRequest('http://localhost/api/uploads/' + segments.map(encodeURIComponent).join('/'), {
    headers,
  })
  return GET_UPLOADS(req, { params: Promise.resolve({ path: segments }) })
}

describe('/api/uploads/[...path] 路径穿越防护', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const traversalPayloads: { seg: string[] }[] = [
    { seg: ['..', 'etc', 'passwd'] },
    { seg: ['..', '..', 'windows', 'system32'] },
    { seg: ['a', '..', 'b.mp4'] },
    { seg: ['..'] },
    { seg: ['..\\..\\windows\\system32'] },
    { seg: ['/etc/passwd'] },
    { seg: ['videos', '..', '..', '..', 'etc', 'passwd'] },
  ]

  it.each(traversalPayloads)('拒绝路径穿越: $seg', async ({ seg }) => {
    const res = await callGET(seg)
    expect([403, 404]).toContain(res.status)
    expect(fs.existsSync).not.toHaveBeenCalled()
  })

  it('非白名单扩展名按 404 处理（不外发 uploads 内任意文件）', async () => {
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ isFile: () => true, size: 10 } as any)
    const res = await callGET(['backup.sql'])
    expect(res.status).toBe(404)
  })

  it('正常文件返回 200 与正确 MIME', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ isFile: () => true, size: 1024 } as any)
    vi.spyOn(fs, 'createReadStream').mockReturnValue(stream.Readable.from(['x']) as any)

    const res = await callGET(['videos', 'demo.mp4'])
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
  })

  it('非法 Range 头被忽略（RFC 语义，返回 200 全量）', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ isFile: () => true, size: 1000 } as any)
    vi.spyOn(fs, 'createReadStream').mockReturnValue(stream.Readable.from(['x']) as any)

    const res = await callGET(['videos', 'demo.mp4'], { Range: 'bytes=abc-def' })
    expect(res.status).toBe(200)
  })

  it('起始超出文件大小返回 416', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ isFile: () => true, size: 1000 } as any)

    const res = await callGET(['videos', 'demo.mp4'], { Range: 'bytes=99999-' })
    expect(res.status).toBe(416)
  })

  it('合法 Range 返回 206 与正确 Content-Range', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ isFile: () => true, size: 1000 } as any)
    vi.spyOn(fs, 'createReadStream').mockImplementation((() => stream.Readable.from(['x'])) as any)

    const res = await callGET(['videos', 'demo.mp4'], { Range: 'bytes=0-99' })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/1000')
    expect(res.headers.get('Content-Length')).toBe('100')
  })
})
