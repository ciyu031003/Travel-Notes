import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P0-1 回归测试：证明「无 sid 的 JWT 不能通过认证」已经生效，防止账号接管链回归
 * （评审 S-1/S-2：相册令牌与登录会话共用密钥+issuer，且历史 requireAuth 只验签不查会话）。
 */
const {
  verifySessionMock,
  getFullSessionPayloadMock,
  verifyTokenMock,
  findByIdMock,
  cookiesMock,
  userFindUniqueMock,
} = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  getFullSessionPayloadMock: vi.fn(),
  verifyTokenMock: vi.fn(),
  findByIdMock: vi.fn(),
  cookiesMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}))

vi.mock('@/lib/auth-utils', () => ({
  verifySession: verifySessionMock,
  getFullSessionPayload: getFullSessionPayloadMock,
  getSessionPayload: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: userFindUniqueMock } } }))
vi.mock('@/lib/repositories/session-repository', () => ({
  prismaSessionRepository: { findById: findByIdMock, touchLastUsed: vi.fn() },
}))
vi.mock('@/lib/services/token-service', () => ({ verifyToken: verifyTokenMock }))
vi.mock('next/headers', () => ({ cookies: cookiesMock }))

import { requireAuth } from '@/lib/auth-middleware'
import { getCurrentUserId } from '@/lib/current-user'

function authedRequest(token = 'some.jwt.value'): NextRequest {
  return new NextRequest('http://example.com/api/me', {
    headers: { cookie: `admin_session=${token}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('P0-1 无 sid 的 JWT（相册令牌形态）不得通过认证', () => {
  it('签名有效但无 sid → requireAuth 返回 401，且不查会话表', async () => {
    verifySessionMock.mockResolvedValue(true)
    // 相册令牌的 payload 只有 subject/role，没有 sid / userId
    getFullSessionPayloadMock.mockResolvedValue({ sub: 'album', role: 'album' })

    const result = await requireAuth(authedRequest())

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
    expect(findByIdMock).not.toHaveBeenCalled()
  })

  it('有 userId 但无 sid 的旧 token → 依然 401（会话不可撤销即不可信）', async () => {
    verifySessionMock.mockResolvedValue(true)
    getFullSessionPayloadMock.mockResolvedValue({ username: 'legacy', userId: 1 })

    const result = await requireAuth(authedRequest())

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
  })

  it('有 sid 但会话已撤销 → 401（对照组，证明查的是数据库会话）', async () => {
    verifySessionMock.mockResolvedValue(true)
    getFullSessionPayloadMock.mockResolvedValue({ username: 'alice', userId: 1, sid: 'sid-1' })
    findByIdMock.mockResolvedValue({
      id: 'sid-1',
      username: 'alice',
      userId: 1,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      userAgent: null,
      ipHash: null,
      revokedAt: new Date(),
    })

    const result = await requireAuth(authedRequest())

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
  })

  it('数据库不可用 → 503 + databaseUnavailable（fail-closed，绝不放行）', async () => {
    verifySessionMock.mockResolvedValue(true)
    getFullSessionPayloadMock.mockResolvedValue({ username: 'alice', userId: 1, sid: 'sid-1' })
    findByIdMock.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await requireAuth(authedRequest())

    expect(result.authenticated).toBe(false)
    expect(result.databaseUnavailable).toBe(true)
    expect(result.status).toBe(503)
    spy.mockRestore()
  })
})

describe('P0-1 getCurrentUserId 对无 sid token 返回 null', () => {
  it('JWT 有 userId 但无 sid → null（不再只验签就当成登录用户）', async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: 'legacy.jwt' }) })
    verifyTokenMock.mockResolvedValue({ username: 'legacy', userId: 1 })

    await expect(getCurrentUserId()).resolves.toBeNull()
    expect(userFindUniqueMock).not.toHaveBeenCalled()
  })

  it('有 sid 但会话不存在 → null', async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: 'jwt.with.sid' }) })
    verifyTokenMock.mockResolvedValue({ username: 'alice', userId: 1, sid: 'ghost' })
    findByIdMock.mockResolvedValue(null)

    await expect(getCurrentUserId()).resolves.toBeNull()
  })
})
