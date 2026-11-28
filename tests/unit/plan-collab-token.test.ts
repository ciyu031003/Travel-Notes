/**
 * P1a 协同鉴权与适配器字节参数的单测。
 *
 * 覆盖：
 *  · collab-token 的签发/校验（HMAC 格式、过期、篡改、planId 绑定、缺密钥）；
 *  · x-collab-secret 常量时间比较；
 *  · middleware 白名单只放行精确前缀 /api/internal/plan-doc；
 *  · Prisma driver adapter 的 Bytes 参数（Prisma 以 base64 字符串传入 → 必须转回 Buffer，
 *    否则 Yjs 快照会被写成「base64 的 ASCII」）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createPoolMock } = vi.hoisted(() => ({ createPoolMock: vi.fn() }))
vi.mock('mysql2/promise', () => ({ createPool: createPoolMock }))

import {
  issueCollabToken,
  verifyCollabToken,
  isCollabSecretValid,
  safeEqualText,
  getCollabSecret,
  COLLAB_TOKEN_TTL_SECONDS,
} from '@/lib/modules/space/plan-collab-token'
import { isPublicPath } from '@/lib/public-paths'
import { PrismaMariaDB } from '@/lib/prisma-adapter'

const SECRET = 'unit-test-collab-secret'
const NOW = 1_800_000_000_000 // 固定时间戳，避免单测依赖真实时钟

describe('collab-token（v1.HMAC，5 分钟有效）', () => {
  it('签发格式：v1.<base64url(payload)>.<base64url(HMAC)>，payload=planId|userId|exp', () => {
    const issued = issueCollabToken({ planId: 42, userId: 7, secret: SECRET, nowMs: NOW })
    const parts = issued.token.split('.')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('v1')
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    expect(payload).toBe('42|7|1800000300')
    expect(parts[1]).not.toContain('=')
    expect(parts[2]).not.toContain('=')
    expect(issued.expiresIn).toBe(COLLAB_TOKEN_TTL_SECONDS)
    expect(issued.exp).toBe(Math.floor(NOW / 1000) + COLLAB_TOKEN_TTL_SECONDS)
  })

  it('校验通过并解出 payload；绑定 planId 时校验计划一致', () => {
    const issued = issueCollabToken({ planId: 42, userId: 7, secret: SECRET, nowMs: NOW })
    const ok = verifyCollabToken(issued.token, { secret: SECRET, planId: 42, nowMs: NOW })
    expect(ok).toEqual({ ok: true, payload: { planId: 42, userId: 7, exp: 1800000300 } })
    expect(verifyCollabToken(issued.token, { secret: SECRET, planId: 43, nowMs: NOW })).toEqual({ ok: false, reason: 'signature' })
  })

  it('篡改签名 / 篡改 payload → signature', () => {
    const issued = issueCollabToken({ planId: 42, userId: 7, secret: SECRET, nowMs: NOW })
    const [, payload, signature] = issued.token.split('.')
    const tampered = 'v1.' + payload + '.' + signature.slice(0, -2) + 'ww'
    expect(verifyCollabToken(tampered, { secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: 'signature' })
    const forgedPayload = Buffer.from('42|8|1800000300').toString('base64').replace(/=+$/, '')
    expect(verifyCollabToken('v1.' + forgedPayload + '.' + signature, { secret: SECRET, nowMs: NOW })).toEqual({
      ok: false,
      reason: 'signature',
    })
  })

  it('过期 token → expired；格式错误 → malformed', () => {
    const issued = issueCollabToken({ planId: 42, userId: 7, secret: SECRET, nowMs: NOW })
    const later = NOW + (COLLAB_TOKEN_TTL_SECONDS + 1) * 1000
    expect(verifyCollabToken(issued.token, { secret: SECRET, nowMs: later })).toEqual({ ok: false, reason: 'expired' })
    expect(verifyCollabToken('not-a-token', { secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyCollabToken('v2.abc.def', { secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: 'malformed' })
  })

  it('换密钥验签失败（realtime 与 app 必须共享同一 COLLAB_SECRET）', () => {
    const issued = issueCollabToken({ planId: 42, userId: 7, secret: SECRET, nowMs: NOW })
    expect(verifyCollabToken(issued.token, { secret: 'other-secret', nowMs: NOW })).toEqual({ ok: false, reason: 'signature' })
  })
})

describe('x-collab-secret 与公开路径', () => {
  it('getCollabSecret：非生产环境回落 dev-collab-secret（本地联调），生产未配置返回 null', () => {
    expect(getCollabSecret()).toBe('dev-collab-secret')
  })

  it('isCollabSecretValid：只认完全一致的密钥（常量时间比较）', () => {
    expect(isCollabSecretValid('dev-collab-secret')).toBe(true)
    expect(isCollabSecretValid('dev-collab-secret ')).toBe(false)
    expect(isCollabSecretValid('wrong')).toBe(false)
    expect(isCollabSecretValid('')).toBe(false)
    expect(isCollabSecretValid(null)).toBe(false)
    expect(isCollabSecretValid(undefined)).toBe(false)
    expect(safeEqualText('abc', 'abc')).toBe(true)
    expect(safeEqualText('abc', 'abd')).toBe(false)
    expect(safeEqualText('abc', 'abcd')).toBe(false)
  })

  it('middleware 白名单只放行精确前缀 /api/internal/plan-doc，不放开 /api/internal/*', () => {
    expect(isPublicPath('/api/internal/plan-doc/42')).toBe(true)
    expect(isPublicPath('/api/internal/plan-doc')).toBe(true)
    expect(isPublicPath('/api/internal/plan-doc-xyz')).toBe(false)
    expect(isPublicPath('/api/internal/other')).toBe(false)
    expect(isPublicPath('/api/spaces/1/plans')).toBe(false)
  })
})

describe('Prisma driver adapter：Bytes 参数（base64 字符串 → 二进制）', () => {
  function fakePool() {
    const conn = {
      ping: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      execute: vi.fn().mockResolvedValue([[], []]),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
    }
    return {
      getConnection: vi.fn().mockResolvedValue(conn),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      execute: vi.fn().mockResolvedValue([[], []]),
      totalConnections: 1,
      activeConnections: 0,
      idleConnections: 1,
      pendingConnections: 0,
      __conn: conn,
    }
  }

  let adapter: PrismaMariaDB
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(async () => { await adapter?.dispose().catch(() => {}) })

  it('queryRaw：argTypes 标 bytes 的 base64 字符串 → Buffer（Yjs 快照不再双重编码）', async () => {
    const pool = fakePool()
    createPoolMock.mockReturnValue(pool)
    adapter = new PrismaMariaDB({ url: 'mysql://user:pass@127.0.0.1:3306/db' } as never)
    const a = await adapter.connect()
    const raw = Buffer.from([1, 2, 250, 0, 9])

    await a.queryRaw({
      sql: 'insert into t (state) values (?)',
      args: [raw.toString('base64'), 'plain', new Uint8Array([3, 4])],
      argTypes: [
        { scalarType: 'bytes', arity: 'required' },
        { scalarType: 'string', arity: 'required' },
        { scalarType: 'bytes', arity: 'required' },
      ],
    } as never)

    const sentArgs = pool.execute.mock.calls[0][1] as unknown[]
    expect(Buffer.isBuffer(sentArgs[0])).toBe(true)
    expect((sentArgs[0] as Buffer).equals(raw)).toBe(true)
    expect(sentArgs[1]).toBe('plain')
    expect(Buffer.isBuffer(sentArgs[2])).toBe(true)
    expect(Array.from(sentArgs[2] as Buffer)).toEqual([3, 4])
  })

  it('queryRaw：没有 argTypes 的普通字符串不被误转（只处理 bytes 类型）', async () => {
    const pool = fakePool()
    createPoolMock.mockReturnValue(pool)
    adapter = new PrismaMariaDB({ url: 'mysql://user:pass@127.0.0.1:3306/db' } as never)
    const a = await adapter.connect()
    await a.queryRaw({ sql: 'select ?', args: ['AQID'], argTypes: [{ scalarType: 'string', arity: 'required' }] } as never)
    expect(pool.execute.mock.calls[0][1][0]).toBe('AQID')
  })
})
