/**
 * C1：SecureStore（Android Keystore 密钥桥）JS 包装回归。
 *
 * 契约：任何失败都必须返回 null（调用方降级明文），绝不抛错把离线层带崩。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const box = vi.hoisted(() => ({
  native: true,
  calls: 0,
  impl: null as null | (() => Promise<unknown>),
}))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => box.native }))

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    getOrCreateSecret: async () => {
      box.calls += 1
      return box.impl ? box.impl() : { secret: '' }
    },
  }),
}))

import { getOrCreateDbSecret, resetDbSecretCache } from '@/lib/modules/offline/native/secure-store'

beforeEach(() => {
  box.native = true
  box.calls = 0
  box.impl = null
  resetDbSecretCache()
})

describe('C1 · SecureStore 包装', () => {
  it('Web（非原生）不调用插件，直接 null', async () => {
    box.native = false
    expect(await getOrCreateDbSecret()).toBeNull()
    expect(box.calls).toBe(0)
  })

  it('原生端拿到口令并缓存（同进程只调一次插件）', async () => {
    box.impl = async () => ({ secret: 'QUJDREVGRw==' })
    expect(await getOrCreateDbSecret()).toBe('QUJDREVGRw==')
    expect(await getOrCreateDbSecret()).toBe('QUJDREVGRw==')
    expect(box.calls).toBe(1)
  })

  it('插件抛错 → 返回 null（调用方据此降级明文），不向上抛', async () => {
    box.impl = async () => { throw new Error('Keystore reset') }
    await expect(getOrCreateDbSecret()).resolves.toBeNull()
  })

  it('插件返回空口令 → null（视为不可用）', async () => {
    box.impl = async () => ({ secret: '' })
    expect(await getOrCreateDbSecret()).toBeNull()
  })
})
