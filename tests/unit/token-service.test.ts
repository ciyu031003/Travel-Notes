import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TokenService } from '@/lib/services/token-service'

/** P3-39：TokenService（签发/校验/黑名单/刷新）此前只有间接覆盖。 */
describe('TokenService', () => {
  it('sign/verify 往返并带自定义 payload', async () => {
    const svc = new TokenService()
    const token = await svc.sign({ username: 'alice', role: 'admin', userId: 1, sid: 'sid-1' })
    const payload = await svc.verify(token)
    expect(payload).toMatchObject({ username: 'alice', role: 'admin', userId: 1, sid: 'sid-1' })
  })

  it('非法 token → null', async () => {
    const svc = new TokenService()
    await expect(svc.verify('not-a-jwt')).resolves.toBeNull()
    await expect(svc.verify('')).resolves.toBeNull()
  })

  it('过期 token → null（TTL 为负）', async () => {
    const svc = new TokenService()
    const token = await svc.sign({ username: 'alice' }, -10)
    await expect(svc.verify(token)).resolves.toBeNull()
  })

  it('verifyWithoutBlacklist：签名有效但已注销的 token 仍可解析（供 logout 定位 sid）', async () => {
    const svc = new TokenService()
    const token = await svc.sign({ username: 'bob', sid: 'sid-2' })
    await svc.blacklistToken(token)
    await expect(svc.verify(token)).resolves.toBeNull()
    const payload = await svc.verifyWithoutBlacklist(token)
    expect(payload?.sid).toBe('sid-2')
  })

  it('持久化黑名单仓库命中 → 拒绝（进程重启后注销仍生效）', async () => {
    const svc = new TokenService()
    const repo = { add: vi.fn(), isBlacklisted: vi.fn().mockResolvedValue(true) }
    svc.attachBlacklistRepository(repo as never)
    const token = await svc.sign({ username: 'carol' })
    await expect(svc.verify(token)).resolves.toBeNull()
    expect(repo.isBlacklisted).toHaveBeenCalled()
  })

  it('refresh：返回新 token（不同 jti），payload 保留 username', async () => {
    const svc = new TokenService()
    const token = await svc.sign({ username: 'dave', userId: 4 })
    const refreshed = await svc.refresh(token)
    expect(refreshed).toBeTruthy()
    expect(refreshed).not.toBe(token)
    const payload = await svc.verify(refreshed!)
    expect(payload?.username).toBe('dave')
    expect(payload?.userId).toBe(4)
  })

  it('refresh 非法 token → null；getBlacklistStats 返回 size', async () => {
    const svc = new TokenService()
    await expect(svc.refresh('bad')).resolves.toBeNull()
    expect(svc.getBlacklistStats()).toHaveProperty('size')
  })
})
