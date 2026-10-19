/**
 * B5：图片分片上传客户端（断点续传）。
 *
 * 锁住三件事：
 *  ① 大图按 512KB 切片、逐片上传、最后 complete；
 *  ② 会话持久化：同一张图（内容 sha）再次上传时先问 status，只补缺失分片；
 *  ③ 分片失败**保留会话**（下次续传），成功才清会话。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  base64ToBytes,
  getSession,
  resetResumableSessionsForTest,
  saveSession,
  sha256Base64,
  uploadImageResumable,
} from '@/lib/media/resumable-upload'

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => map.clear(),
    key: () => null,
    _map: map,
  }
}

/** 700KB → 2 个 512KB 分片（验证多片路径） */
const BIG_BASE64 = Buffer.alloc(700 * 1024, 7).toString('base64')
const UPLOAD_ID = '11111111-1111-4111-8111-111111111111'

interface Call { url: string; body: unknown }

function makeFetch(handlers: {
  init?: (body: Record<string, unknown>) => { status: number; json: Record<string, unknown> }
  status?: () => { status: number; json: Record<string, unknown> }
  chunk?: (index: number) => { status: number; json: Record<string, unknown> }
  complete?: () => { status: number; json: Record<string, unknown> }
}) {
  const calls: Call[] = []
  let chunkIndex = 0
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = init?.body
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData
    if (isForm) {
      const index = Number((body as FormData).get('index'))
      calls.push({ url: String(url), body: { chunk: index } })
      chunkIndex = index
      const res = (handlers.chunk || (() => ({ status: 200, json: { received: true } })))(index)
      return { ok: res.status < 400, status: res.status, json: async () => res.json } as unknown as Response
    }
    const parsed = JSON.parse(String(body)) as Record<string, unknown>
    calls.push({ url: String(url), body: parsed })
    const action = String(parsed.action)
    if (action === 'init') {
      const res = (handlers.init || (() => ({ status: 200, json: { uploadId: UPLOAD_ID, chunkSize: 512 * 1024, totalChunks: 2 } })))(parsed)
      return { ok: res.status < 400, status: res.status, json: async () => res.json } as unknown as Response
    }
    if (action === 'status') {
      const res = (handlers.status || (() => ({ status: 200, json: { exists: true, uploaded: [] } })))()
      return { ok: res.status < 400, status: res.status, json: async () => res.json } as unknown as Response
    }
    if (action === 'complete') {
      const res = (handlers.complete || (() => ({ status: 200, json: { success: true, media: [{ id: 99 }] } })))()
      return { ok: res.status < 400, status: res.status, json: async () => res.json } as unknown as Response
    }
    void chunkIndex
    return { ok: false, status: 400, json: async () => ({ error: 'unknown action' }) } as unknown as Response
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const storage = makeStorage()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', storage)
  resetResumableSessionsForTest()
})

describe('B5 · 分片上传协议', () => {
  it('700KB 图片切成 2 片：init → status → 2×chunk → complete', async () => {
    const { fetchImpl, calls } = makeFetch({})
    const result = await uploadImageResumable({
      albumId: 12,
      base64: BIG_BASE64,
      mimeType: 'image/jpeg',
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.resumed).toBe(false)
    expect((result.media as Array<{ id: number }>)[0].id).toBe(99)
    const actions = calls.map((c) => (c.body as { action?: string }).action || 'chunk')
    expect(actions).toEqual(['init', 'status', 'chunk', 'chunk', 'complete'])
    // 成功即清会话（否则下次会拿过期 uploadId 续传）
    expect(getSession(await sha256Base64(BIG_BASE64))).toBeNull()
  })

  it('续传：已上传的分片跳过，只补缺失片', async () => {
    const sha = await sha256Base64(BIG_BASE64)
    saveSession(sha, {
      uploadId: UPLOAD_ID,
      albumId: 12,
      totalChunks: 2,
      size: base64ToBytes(BIG_BASE64).length,
      sha256: sha,
      createdAt: Date.now(),
    })
    const { fetchImpl, calls } = makeFetch({
      status: () => ({ status: 200, json: { exists: true, uploaded: [0], totalChunks: 2 } }),
    })

    const result = await uploadImageResumable({ albumId: 12, base64: BIG_BASE64, fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.resumed).toBe(true)
    const chunkCalls = calls.filter((c) => (c.body as { chunk?: number }).chunk != null)
    expect(chunkCalls.map((c) => (c.body as { chunk: number }).chunk)).toEqual([1])
  })

  it('分片失败 → ok:false 且**保留会话**（下次可续传）', async () => {
    const { fetchImpl } = makeFetch({
      chunk: () => ({ status: 500, json: { error: 'boom' } }),
    })
    const result = await uploadImageResumable({ albumId: 12, base64: BIG_BASE64, fetchImpl })

    expect(result.ok).toBe(false)
    // 优先透出服务端错误原文（便于用户/日志定位），没有时回退通用文案
    expect(result.error).toContain('boom')
    const sha = await sha256Base64(BIG_BASE64)
    expect(getSession(sha)).not.toBeNull()
  })

  it('init 失败 → ok:false 且不建会话', async () => {
    const { fetchImpl } = makeFetch({ init: () => ({ status: 413, json: { error: '图片过大' } }) })
    const result = await uploadImageResumable({ albumId: 12, base64: BIG_BASE64, fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('图片过大')
    expect(getSession(await sha256Base64(BIG_BASE64))).toBeNull()
  })

  it('相册变化导致旧会话作废（不把 A 相册的分片传到 B 相册）', async () => {
    const sha = await sha256Base64(BIG_BASE64)
    saveSession(sha, {
      uploadId: UPLOAD_ID,
      albumId: 1,
      totalChunks: 2,
      size: base64ToBytes(BIG_BASE64).length,
      sha256: sha,
      createdAt: Date.now(),
    })
    const { fetchImpl, calls } = makeFetch({})
    const result = await uploadImageResumable({ albumId: 2, base64: BIG_BASE64, fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.resumed).toBe(false)
    expect(calls[0].body).toMatchObject({ action: 'init', albumId: 2 })
  })
})

describe('B5 · 基础工具', () => {
  it('base64 → bytes 长度正确', () => {
    const bytes = base64ToBytes(Buffer.from('hello').toString('base64'))
    expect(bytes.length).toBe(5)
    // 用 Buffer 比较而不是展开运算符：tsconfig target=ES5 下展开 Uint8Array 会报 TS2802
    expect(Buffer.from(bytes).toString('utf8')).toBe('hello')
  })

  it('sha256Base64 稳定且不同内容不同值', async () => {
    const a = await sha256Base64('aGVsbG8=')
    const b = await sha256Base64('aGVsbG8=')
    const c = await sha256Base64('d29ybGQ=')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
