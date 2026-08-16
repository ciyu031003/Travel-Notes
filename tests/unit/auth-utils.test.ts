import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, signSession, verifySession, getSessionPayload } from '@/lib/auth-utils'

describe('auth-utils', () => {
  it('hashPassword / verifyPassword 往返', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('signSession / verifySession 往返', async () => {
    const token = await signSession({ username: 'alice' })
    expect(token.split('.').length).toBe(3)
    expect(await verifySession(token)).toBe(true)
  })

  it('伪造 token 校验失败', async () => {
    expect(await verifySession('abc.def.ghi')).toBe(false)
    expect(await verifySession('')).toBe(false)
  })

  it('getSessionPayload 解析未过期 token', async () => {
    const token = await signSession({ username: 'bob' })
    const payload = getSessionPayload(token)
    expect(payload).not.toBeNull()
    expect(payload!.username).toBe('bob')
    expect(payload!.exp).toBeGreaterThan(Date.now())
  })

  it('getSessionPayload 拒绝畸形 token', () => {
    expect(getSessionPayload('not-a-jwt')).toBeNull()
    expect(getSessionPayload('')).toBeNull()
  })
})
