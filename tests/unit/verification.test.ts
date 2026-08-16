import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    verificationCode: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import {
  generateVerificationCode,
  storeVerificationCode,
  verifyVerificationCode,
  consumeVerificationCode,
  getVerificationCodeStatus,
} from '@/lib/verification'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('邮箱验证码（DB 化，只存哈希）', () => {
  it('生成 6 位验证码', () => {
    const code = generateVerificationCode()
    expect(code).toMatch(/^\d{6}$/)
  })

  it('存储时保存哈希而非明文', async () => {
    prismaMock.verificationCode.create.mockResolvedValue({ id: 1 })
    await storeVerificationCode('a@b.com', '123456')
    const arg = prismaMock.verificationCode.create.mock.calls[0][0]
    expect(arg.data.codeHash).not.toBe('123456')
    expect(arg.data.codeHash).toHaveLength(64)
    expect(arg.data.purpose).toBe('BIND_EMAIL')
  })

  it('校验正确验证码通过', async () => {
    prismaMock.verificationCode.create.mockResolvedValue({ id: 1 })
    await storeVerificationCode('a@b.com', '654321')
    const stored = prismaMock.verificationCode.create.mock.calls[0][0].data

    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: stored.codeHash,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      createdAt: new Date(),
    })
    expect(await verifyVerificationCode('a@b.com', '654321')).toBe(true)
  })

  it('错误验证码累计尝试次数', async () => {
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 1,
      codeHash: 'x'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      createdAt: new Date(),
    })
    prismaMock.verificationCode.update.mockResolvedValue({})
    expect(await verifyVerificationCode('a@b.com', '000000')).toBe(false)
    expect(prismaMock.verificationCode.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { attempts: 1, consumedAt: null },
    })
  })

  it('过期验证码校验失败', async () => {
    prismaMock.verificationCode.findFirst.mockResolvedValue(null)
    expect(await verifyVerificationCode('a@b.com', '123456')).toBe(false)
  })

  it('consume 标记为已使用', async () => {
    prismaMock.verificationCode.findFirst.mockResolvedValue({ id: 1 })
    prismaMock.verificationCode.update.mockResolvedValue({})
    await consumeVerificationCode('a@b.com')
    expect(prismaMock.verificationCode.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { consumedAt: expect.any(Date) },
    })
  })

  it('冷却期内不可重发', async () => {
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 1,
      expiresAt: new Date(Date.now() + 300_000),
      createdAt: new Date(),
    })
    const status = await getVerificationCodeStatus('a@b.com')
    expect(status.canSend).toBe(false)
    expect(status.remainingSeconds).toBeGreaterThan(0)
  })
})
