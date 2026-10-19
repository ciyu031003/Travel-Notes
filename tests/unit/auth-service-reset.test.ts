import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * B11：忘记密码流程必须按邮箱精确定位用户（旧实现读「首用户的设置」，非首用户永远找不回密码，
 * 且写路径会落到首用户头上）。
 */

const { repoMock, sessionMock, verificationMock, mailerMock } = vi.hoisted(() => ({
  repoMock: {
    updateCredentials: vi.fn(),
    initializeFromEnv: vi.fn(),
    findByEmail: vi.fn(),
    updatePasswordById: vi.fn(),
  },
  sessionMock: { revokeAllForUser: vi.fn(), create: vi.fn(), findById: vi.fn(), extendExpiry: vi.fn(), revoke: vi.fn() },
  verificationMock: {
    generateVerificationCode: vi.fn(() => '123456'),
    storeResetCode: vi.fn(),
    getResetCodeStatus: vi.fn(async () => ({ canSend: true, remainingSeconds: 0 })),
    verifyResetCode: vi.fn(async () => true),
    consumeResetCode: vi.fn(),
  },
  mailerMock: { sendMail: vi.fn(async () => true) },
}))

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() } } }))
vi.mock('@/lib/verification', () => verificationMock)
vi.mock('@/lib/infrastructure/mailer', () => mailerMock)
vi.mock('@/lib/auth-utils', () => ({
  hashPassword: vi.fn(async () => 'new-hash'),
  verifyPassword: vi.fn(async () => true),
  signSession: vi.fn(async () => 't'),
  verifySession: vi.fn(async () => null),
  getSessionPayload: vi.fn(() => null),
}))

import { AuthService } from '@/lib/services/auth-service'

function makeService() {
  return new AuthService(repoMock as any, {} as any, sessionMock as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  verificationMock.getResetCodeStatus.mockResolvedValue({ canSend: true, remainingSeconds: 0 })
  verificationMock.verifyResetCode.mockResolvedValue(true)
})

describe('忘记密码按邮箱定位（B11）', () => {
  it('resetPassword 只改该邮箱对应用户的密码，并撤销他自己的会话', async () => {
    repoMock.findByEmail.mockResolvedValue({ id: 42, username: 'bob', emailVerified: true })

    const result = await makeService().resetPassword('bob@example.com', '123456', 'NewPassw0rd!')

    expect(result.success).toBe(true)
    expect(repoMock.findByEmail).toHaveBeenCalledWith('bob@example.com')
    expect(repoMock.updatePasswordById).toHaveBeenCalledWith(42, 'new-hash')
    expect(repoMock.updateCredentials).not.toHaveBeenCalled()
    expect(sessionMock.revokeAllForUser).toHaveBeenCalledWith('bob')
  })

  it('邮箱未绑定 → 明确失败，不写任何密码', async () => {
    repoMock.findByEmail.mockResolvedValue(null)

    const result = await makeService().resetPassword('nobody@example.com', '123456', 'NewPassw0rd!')

    expect(result.success).toBe(false)
    expect(repoMock.updatePasswordById).not.toHaveBeenCalled()
    expect(repoMock.updateCredentials).not.toHaveBeenCalled()
  })

  it('sendResetCode 对非首用户邮箱也能发码（旧实现只看首用户）', async () => {
    repoMock.findByEmail.mockResolvedValue({ id: 42, username: 'bob', emailVerified: true })

    const result = await makeService().sendResetCode('bob@example.com')

    expect(result.success).toBe(true)
    expect(verificationMock.storeResetCode).toHaveBeenCalled()
    expect(mailerMock.sendMail).toHaveBeenCalled()
  })

  it('未验证邮箱 → 拒绝（与原提示一致）', async () => {
    repoMock.findByEmail.mockResolvedValue({ id: 42, username: 'bob', emailVerified: false })
    const result = await makeService().sendResetCode('bob@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toContain('未验证')
  })

  it('旧的 changePassword（改首用户密码）已从 AuthService 删除', () => {
    const svc = makeService() as unknown as Record<string, unknown>
    expect(svc.changePassword).toBeUndefined()
  })
})
