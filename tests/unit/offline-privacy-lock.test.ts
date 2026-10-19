/**
 * C1：真实隐私锁（PIN）回归。
 *
 * 锁住四件事：
 *  ① PIN 只以「随机盐 + SHA-256」落盘，**绝不存明文**；
 *  ② 4–8 位数字校验（3 位/9 位/含字母一律拒绝）；
 *  ③ 会话语义：设置 PIN 后本人当场放行；lockNow 立刻锁定；markUnlocked 恢复；
 *  ④ 关闭（clearPin）会清掉 PIN 与开关，之后 verify 恒 false。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/modules/offline/platform', () => ({
  isNativePlatform: () => true,
  isWebPlatform: () => false,
}))

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => map.clear(),
    key: () => null,
    _map: map,
  }
}

const local = makeStorage()
const session = makeStorage()

import * as lock from '@/lib/modules/offline/privacy-lock'

beforeEach(() => {
  local._map.clear()
  session._map.clear()
  vi.stubGlobal('localStorage', local)
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('crypto', globalThis.crypto)
  lock.lockNow()
  lock.clearPin()
  local._map.clear()
  session._map.clear()
})

describe('C1 · PIN 格式', () => {
  it('只接受 4–8 位数字', () => {
    expect(lock.isValidPin('1234')).toBe(true)
    expect(lock.isValidPin('12345678')).toBe(true)
    expect(lock.isValidPin('123')).toBe(false)
    expect(lock.isValidPin('123456789')).toBe(false)
    expect(lock.isValidPin('12a4')).toBe(false)
    expect(lock.isValidPin('')).toBe(false)
  })
})

describe('C1 · PIN 存储与校验', () => {
  it('落盘的是盐 + 哈希，不含明文 PIN', async () => {
    expect(await lock.setPin('2580')).toBe(true)
    const raw = local.getItem('tiantu-privacy-pin')
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('2580')
    const record = JSON.parse(raw as string)
    expect(record.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/)

    expect(await lock.verifyPin('2580')).toBe(true)
    expect(await lock.verifyPin('2581')).toBe(false)
    // 同一 PIN 再设一次应换盐（不同哈希）
    const firstHash = record.hash
    await lock.setPin('2580')
    expect(JSON.parse(local.getItem('tiantu-privacy-pin') as string).hash).not.toBe(firstHash)
  })

  it('未设置 PIN 时 verify 恒 false（不能靠"长度≥4"混过去）', async () => {
    expect(lock.hasPin()).toBe(false)
    expect(await lock.verifyPin('1234')).toBe(false)
  })

  it('非法 PIN 不被接受、也不落盘', async () => {
    expect(await lock.setPin('12')).toBe(false)
    expect(await lock.setPin('abcd')).toBe(false)
    expect(lock.hasPin()).toBe(false)
  })
})

describe('C1 · 开关与解锁状态', () => {
  it('设置 PIN 后即开启且本人当场放行；lockNow 后要求重新解锁', async () => {
    await lock.setPin('123456')
    expect(lock.getPrivacyLockEnabled()).toBe(true)
    expect(lock.lockState()).toEqual({ enabled: true, locked: false })

    lock.lockNow()
    expect(lock.lockState()).toEqual({ enabled: true, locked: true })
    expect(lock.isUnlocked()).toBe(false)

    lock.markUnlocked()
    expect(lock.lockState()).toEqual({ enabled: true, locked: false })
  })

  it('clearPin 清掉 PIN 与开关（之后 verify 恒 false）', async () => {
    await lock.setPin('1234')
    lock.clearPin()
    expect(lock.hasPin()).toBe(false)
    expect(lock.getPrivacyLockEnabled()).toBe(false)
    expect(await lock.verifyPin('1234')).toBe(false)
    expect(lock.lockState()).toEqual({ enabled: false, locked: false })
  })

  it('没设 PIN 时开关不生效（防止"开关=开但无门禁"的假安全）', () => {
    local.setItem('tiantu-privacy-lock', '1')
    expect(lock.getPrivacyLockEnabled()).toBe(false)
  })
})
