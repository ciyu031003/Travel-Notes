import { describe, it, expect } from 'vitest'
import { hashPassword } from '@/lib/auth-utils'
import {
  validatePassword,
  validateRegister,
  validateChangePassword,
  ResetPasswordSchema,
  PasswordSchema,
} from '@/lib/validators/auth.validator'

describe('密码策略（P1-12）', () => {
  it('少于 8 位拒绝（与 /admin/setup 对齐）', () => {
    const result = validatePassword('Ab1!xyz')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.message).toContain('8')
  })

  it('常见弱口令被黑名单拒绝', () => {
    for (const weak of ['12345678', 'password', 'password123', 'qwerty123', 'admin123', 'travel123']) {
      const result = validatePassword(weak)
      expect(result.valid, weak).toBe(false)
    }
  })

  it('单字符重复被拒绝', () => {
    expect(validatePassword('aaaaaaaa').valid).toBe(false)
    expect(validatePassword('!!!!!!!!').valid).toBe(false)
  })

  it('足够强的密码通过', () => {
    expect(validatePassword('Travel#2026-notes').valid).toBe(true)
  })

  it('超过 128 位拒绝', () => {
    expect(validatePassword('a'.repeat(129) + 'Aa1!').valid).toBe(false)
  })

  it('注册 schema 复用同一策略', () => {
    expect(validateRegister({ username: 'alice', password: '123456' }).success).toBe(false)
    expect(validateRegister({ username: 'alice', password: 'password123' }).success).toBe(false)
    expect(validateRegister({ username: 'alice', password: 'Str0ng#Passw0rd' }).success).toBe(true)
  })

  it('改密 schema 与新密码策略一致', () => {
    expect(validateChangePassword({ currentPassword: 'old', newPassword: '12345678' }).success).toBe(false)
    expect(validateChangePassword({ currentPassword: 'old', newPassword: 'Str0ng#Passw0rd' }).success).toBe(true)
  })

  it('重置密码 schema 校验邮箱/验证码/新密码', () => {
    expect(ResetPasswordSchema.safeParse({ email: 'bad', code: '123456', newPassword: 'Str0ng#Passw0rd' }).success).toBe(false)
    expect(ResetPasswordSchema.safeParse({ email: 'a@b.com', code: '123', newPassword: 'Str0ng#Passw0rd' }).success).toBe(false)
    expect(ResetPasswordSchema.safeParse({ email: 'a@b.com', code: '123456', newPassword: '12345678' }).success).toBe(false)
    expect(ResetPasswordSchema.safeParse({ email: 'a@b.com', code: '123456', newPassword: 'Str0ng#Passw0rd' }).success).toBe(true)
  })

  it('PasswordSchema 的错误信息与 validatePassword 一致（中文）', () => {
    const parsed = PasswordSchema.safeParse('12345678')
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues[0].message).toContain('常见')
  })
})

describe('bcrypt cost（P1-12：10 → 12）', () => {
  it('新哈希使用 cost 12', async () => {
    const hash = await hashPassword('Str0ng#Passw0rd')
    // bcrypt 哈希格式：$2b$<cost>$<salt+hash>
    const cost = Number(hash.split('$')[2])
    expect(cost).toBe(12)
  }, 20_000)
})
