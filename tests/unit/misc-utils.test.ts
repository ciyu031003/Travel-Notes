import { describe, it, expect, afterEach, vi } from 'vitest'
import { isNewerVersion } from '@/lib/app-version'
import { encryptSecret, decryptSecret, isSecretEncryptionConfigured } from '@/lib/infrastructure/secret-crypto'
import { generateAccountIdForUser } from '@/lib/account-id'

/** P3-39：版本比较 / 敏感配置加解密 / 账号 ID 生成（纯逻辑）此前无直接单测。 */
describe('isNewerVersion（OTA 版本比较）', () => {
  it('同版本不更新', () => {
    expect(isNewerVersion('1.24.9', '1.24.9')).toBe(false)
  })

  it('patch/minor/major 任一段更大即为新版本', () => {
    expect(isNewerVersion('1.24.9', '1.24.10')).toBe(true)
    expect(isNewerVersion('1.24.9', '1.25.0')).toBe(true)
    expect(isNewerVersion('1.24.9', '2.0.0')).toBe(true)
  })

  it('旧版本/非数字段按 0 处理', () => {
    expect(isNewerVersion('1.24.10', '1.24.9')).toBe(false)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(false)
    expect(isNewerVersion('1.24', '1.24.0')).toBe(false)
    expect(isNewerVersion('1.x.0', '1.0.1')).toBe(true)
  })
})

describe('secret-crypto（AES-256-GCM）', () => {
  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY
  })

  it('未配置密钥：isConfigured=false，加解密返回 null（视为禁用）', () => {
    delete process.env.APP_ENCRYPTION_KEY
    expect(isSecretEncryptionConfigured()).toBe(false)
    expect(encryptSecret('secret')).toBeNull()
    expect(decryptSecret('abc', 'abc')).toBeNull()
  })

  it('配置密钥后加密→解密往返（密文 base64、IV 12 字节）', () => {
    process.env.APP_ENCRYPTION_KEY = 'test-encryption-key-for-vitest'
    expect(isSecretEncryptionConfigured()).toBe(true)
    const enc = encryptSecret('sk-1234567890')!
    expect(enc.valueEnc).not.toContain('sk-1234567890')
    expect(Buffer.from(enc.iv, 'base64')).toHaveLength(12)
    expect(decryptSecret(enc.valueEnc, enc.iv)).toBe('sk-1234567890')
  })

  it('密文被篡改 → 解密失败返回 null 并记录错误（不抛）', () => {
    process.env.APP_ENCRYPTION_KEY = 'test-encryption-key-for-vitest'
    const enc = encryptSecret('value')!
    const tampered = Buffer.from(enc.valueEnc, 'base64')
    tampered[0] = tampered[0] ^ 0xff
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(decryptSecret(tampered.toString('base64'), enc.iv)).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('换密钥后旧密文解不开（返回 null）', () => {
    process.env.APP_ENCRYPTION_KEY = 'key-one'
    const enc = encryptSecret('value')!
    process.env.APP_ENCRYPTION_KEY = 'key-two'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(decryptSecret(enc.valueEnc, enc.iv)).toBeNull()
    spy.mockRestore()
  })
})

describe('generateAccountIdForUser', () => {
  it('admin 固定 01230821', () => {
    expect(generateAccountIdForUser({ username: 'admin' })).toBe('01230821')
  })

  it('设置过纪念日：两位随机前缀 + YYYYMMDD', () => {
    const id = generateAccountIdForUser({ username: 'alice', anniversaryStart: '2020-05-20' })
    expect(id).toMatch(/^\d{2}20200520$/)
    expect(id).toHaveLength(10)
  })

  it('普通用户为 8 位数字且不重复', () => {
    const used = new Set<string>()
    const first = generateAccountIdForUser({ username: 'bob' }, used)
    expect(first).toMatch(/^\d{8}$/)
    expect(used.has(first)).toBe(true)
    const second = generateAccountIdForUser({ username: 'carol' }, used)
    expect(used.has(second)).toBe(true)
    expect(second).not.toBe(first)
  })
})
