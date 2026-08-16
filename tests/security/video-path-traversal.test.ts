import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import fs from 'node:fs'
import stream from 'node:stream'
import { NextRequest } from 'next/server'

// 动态导入路由（路径含方括号，使用相对路径避免别名歧义）
let routeGET: (req: NextRequest, params: { params: Promise<{ filename: string }> }) => Promise<Response>
beforeAll(async () => {
  const mod = await import('../../app/api/video/[filename]/route')
  routeGET = mod.GET
})

async function callGET(filename: string, headers: Record<string, string> = {}) {
  const req = new NextRequest('http://localhost/api/video/' + encodeURIComponent(filename), {
    headers,
  })
  return routeGET(req, { params: Promise.resolve({ filename }) })
}

describe('/api/video/[filename] 路径穿越防护', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const traversalPayloads = [
    '../etc/passwd',
    '..\\..\\windows\\system32',
    '../../../../etc/passwd',
    'a/../b.mp4',
    '..',
    '/etc/passwd',
  ]

  it.each(traversalPayloads)('拒绝路径穿越: %s', async (payload) => {
    const res = await callGET(payload)
    expect(res.status).toBe(404)
    expect(fs.existsSync).not.toHaveBeenCalled()
  })

  it('正常文件名返回 200 与正确 MIME', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as any)
    vi.spyOn(fs, 'createReadStream').mockReturnValue(stream.Readable.from([]) as any)

    const res = await callGET('demo.mp4')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
  })

  it('无效 Range 请求返回 416', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1000 } as any)

    const res = await callGET('demo.mp4', { Range: 'bytes=abc-def' })
    expect(res.status).toBe(416)
  })

  it('起始超出文件大小返回 416', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1000 } as any)

    const res = await callGET('demo.mp4', { Range: 'bytes=99999-' })
    expect(res.status).toBe(416)
  })
})
