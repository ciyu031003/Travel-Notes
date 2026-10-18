import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 会话撤销判定（P1-10）：撤销/过期/缺失 sid/数据库异常必须 fail-closed。
 * mock 掉 session repository，避免单元测试依赖真实 MySQL。
 */
const { findByIdMock } = vi.hoisted(() => ({ findByIdMock: vi.fn() }))

vi.mock('@/lib/repositories/session-repository', () => ({
  prismaSessionRepository: {
    findById: findByIdMock,
    touchLastUsed: vi.fn(),
  },
}))

import { validateSession } from '@/lib/session'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sid-1',
    username: 'alice',
    userId: 1,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    lastUsedAt: new Date(),
    userAgent: null,
    ipHash: null,
    revokedAt: null,
    ...overrides,
  }
}

describe('validateSession 会话有效性判定', () => {
  beforeEach(() => {
    findByIdMock.mockReset()
  })

  it('有效会话返回 valid 与剩余秒数', async () => {
    findByIdMock.mockResolvedValue(row())
    const result = await validateSession('sid-1')
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.session?.username).toBe('alice')
    expect(result.session!.remainingSeconds).toBeGreaterThan(0)
    expect(findByIdMock).toHaveBeenCalledWith('sid-1')
  })

  it('已撤销会话 → invalid(revoked)，不做任何兜底放行', async () => {
    findByIdMock.mockResolvedValue(row({ revokedAt: new Date() }))
    const result = await validateSession('sid-1')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('revoked')
    expect(result.databaseUnavailable).toBeUndefined()
  })

  it('已过期会话 → invalid(expired)', async () => {
    findByIdMock.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }))
    const result = await validateSession('sid-1')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('会话不存在 → invalid(not-found)', async () => {
    findByIdMock.mockResolvedValue(null)
    const result = await validateSession('sid-1')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('not-found')
  })

  it('缺少 sid → invalid(no-sid) 且不查库（无法撤销的会话不被信任）', async () => {
    const result = await validateSession(undefined)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('no-sid')
    expect(findByIdMock).not.toHaveBeenCalled()
  })

  it('数据库异常 → fail-closed：invalid + databaseUnavailable（调用方应返回 5xx，绝不放行）', async () => {
    findByIdMock.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await validateSession('sid-1')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('db-error')
    expect(result.databaseUnavailable).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
