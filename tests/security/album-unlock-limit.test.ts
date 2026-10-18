import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * P0-5 回归：相册口令解锁的限流与失败退避（S-8）。
 *
 * 口令来源是「纪念日日期」（低熵），此前全文件无任何限流 → 匿名可在线枚举解锁。
 * 这里锁三层行为：① IP 窗口超限 429；② 全局窗口超限 429；③ 失败退避锁 429；
 * 以及成功/未设口令时清除失败计数。
 */

const { rateLimitMock, checkLockMock, recordFailureMock, clearFailuresMock, siteConfigMock, requireAuthMock } = vi.hoisted(() => ({
  rateLimitMock: vi.fn(),
  checkLockMock: vi.fn(),
  recordFailureMock: vi.fn(),
  clearFailuresMock: vi.fn(),
  siteConfigMock: vi.fn(),
  requireAuthMock: vi.fn(),
}))

vi.mock('@/lib/infrastructure/rate-limit', () => ({
  rateLimit: rateLimitMock,
  checkLoginLock: checkLockMock,
  recordLoginFailure: recordFailureMock,
  clearLoginFailures: clearFailuresMock,
}))
vi.mock('@/lib/db', () => ({ prisma: { anniversary: { findFirst: vi.fn(async () => null) } } }))
vi.mock('@/lib/auth-middleware', () => ({ requireAuth: requireAuthMock }))
vi.mock('@/lib/request-utils', () => ({ getClientIp: vi.fn(() => '1.2.3.4') }))
vi.mock('@/lib/container', () => ({
  getSiteService: () => ({ getSiteConfig: siteConfigMock }),
}))
vi.mock('@/lib/album-auth', () => ({
  generateAlbumToken: vi.fn(async () => 'album-token'),
  ALBUM_COOKIE: 'album_token',
}))

import { POST } from '@/app/api/verify-album-password/route'

function req(body: Record<string, unknown> = { date: '2020-05-20' }) {
  return new Request('http://localhost/api/verify-album-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rateLimitMock.mockReturnValue({ ok: true, used: 1, remaining: 9, retryAfterSeconds: 60 })
  checkLockMock.mockReturnValue({ locked: false, retryAfterSeconds: 0 })
  recordFailureMock.mockReturnValue({ locked: true, retryAfterSeconds: 60 })
  requireAuthMock.mockResolvedValue({ authenticated: false })
  siteConfigMock.mockResolvedValue({ anniversaryStart: '2020-05-20' })
})

describe('P0-5 相册解锁限流', () => {
  it('IP 维度超限 → 429 + retryAfterSeconds（不再进入口令校验）', async () => {
    rateLimitMock.mockReturnValue({ ok: false, used: 10, remaining: 0, retryAfterSeconds: 120 })

    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ success: false, retryAfterSeconds: 120 })
    expect(rateLimitMock.mock.calls[0][0]).toMatchObject({ prefix: 'album:ip', limit: 10 })
    expect(siteConfigMock).not.toHaveBeenCalled()
  })

  it('全局维度超限 → 429（挡住换 IP 的分布式爆破）', async () => {
    rateLimitMock.mockImplementation((opts: any) =>
      opts.prefix === 'album:global'
        ? { ok: false, used: 30, remaining: 0, retryAfterSeconds: 300 }
        : { ok: true, used: 1, remaining: 9, retryAfterSeconds: 60 },
    )

    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ retryAfterSeconds: 300 })
    expect(siteConfigMock).not.toHaveBeenCalled()
  })

  it('失败退避锁生效 → 429 且带 retryAfterSeconds', async () => {
    checkLockMock.mockReturnValue({ locked: true, retryAfterSeconds: 900 })

    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ retryAfterSeconds: 900 })
    // 锁的 key 必须按 IP 维度，不能全局共享（否则一个人失败锁住所有人）
    expect(checkLockMock.mock.calls[0][0]).toBe('album:1.2.3.4')
    expect(siteConfigMock).not.toHaveBeenCalled()
  })

  it('口令错误 → 401 且记录失败（含退避秒数），不清锁', async () => {
    const res = await POST(req({ date: '1999-01-01' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.retryAfterSeconds).toBe(60)
    expect(recordFailureMock).toHaveBeenCalledWith(
      'album:1.2.3.4',
      expect.objectContaining({ baseLockMs: 60_000, maxLockMs: 30 * 60_000 }),
    )
    expect(clearFailuresMock).not.toHaveBeenCalled()
  })

  it('口令正确 → 成功签发 album_token 并清除失败计数', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true })
    expect(clearFailuresMock).toHaveBeenCalledWith('album:1.2.3.4')
    expect(res.headers.get('set-cookie') || '').toContain('album_token=')
  })

  it('未设置纪念日 → 直接解锁（不强制密码），也清失败计数', async () => {
    siteConfigMock.mockResolvedValue({ anniversaryStart: null })
    const res = await POST(req({ skip: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, unlocked: true })
    expect(clearFailuresMock).toHaveBeenCalledWith('album:1.2.3.4')
  })
})
