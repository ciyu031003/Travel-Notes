/**
 * 离线库「取连接」回归：**重载后必须复用已有连接，而不是再次 createConnection**。
 *
 * 为什么这是真机级别的问题（由 Android 原生实现决定，见插件源码
 * CapacitorSQLite.java: `String msg = "Connection " + dbName + " already exists"`）：
 * WebView 每次重载都会重建 JS 上下文 —— 本模块里的 `db` 缓存随之清空，
 * 但原生侧的连接依然活着（`closeOfflineDb` 没有调用方）。
 * 若此时仍调用 `createConnection`，原生直接抛「already exists」，
 * `getOfflineDb()` 随之拒绝 → **整个离线层当场失效**：
 * 本地读恒空、同步队列读不出来、离线写全部失败，且没有任何提示。
 *
 * 契约：先 checkConnectionsConsistency → isConnection；
 *       已存在则 retrieveConnection，不存在才 createConnection。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  createCalls: 0,
  retrieveCalls: 0,
  consistencyCalls: 0,
  existing: false,
  createThrows: false,
  openCalls: 0,
}))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))

vi.mock('@capacitor-community/sqlite', () => {
  class FakeConnection {
    async open() {
      state.openCalls++
    }
    async execute() {
      return { changes: { changes: 0 } }
    }
    async query(sql: string) {
      // healColumns / tableColumns 会查 PRAGMA；返回空结果即可（不阻断初始化）
      if (sql.includes('PRAGMA')) return { values: [] }
      return { values: [] }
    }
  }
  class SQLiteConnection {
    async checkConnectionsConsistency() {
      state.consistencyCalls++
      return { result: state.existing }
    }
    async isConnection() {
      return { result: state.existing }
    }
    async createConnection() {
      state.createCalls++
      if (state.createThrows) throw new Error('Connection tiantu_offline already exists')
      return new FakeConnection()
    }
    async retrieveConnection() {
      state.retrieveCalls++
      return new FakeConnection()
    }
    async closeConnection() {}
  }
  return { SQLiteConnection, CapacitorSQLite: {} }
})

import { getOfflineDb, closeOfflineDb } from '@/lib/modules/offline/native/sqlite-db'

beforeEach(async () => {
  await closeOfflineDb().catch(() => {})
  state.createCalls = 0
  state.retrieveCalls = 0
  state.consistencyCalls = 0
  state.openCalls = 0
  state.existing = false
  state.createThrows = false
})

describe('getOfflineDb · 连接获取', () => {
  it('首次：连接不存在 → createConnection，并核对一致性', async () => {
    const conn = await getOfflineDb()
    expect(conn).toBeTruthy()
    expect(state.createCalls).toBe(1)
    expect(state.retrieveCalls).toBe(0)
    expect(state.consistencyCalls).toBe(1)
    expect(state.openCalls).toBe(1)
  })

  it('重载后：原生连接仍在 → **复用 retrieveConnection**，不再 createConnection', async () => {
    state.existing = true
    const conn = await getOfflineDb()
    expect(conn).toBeTruthy()
    expect(state.retrieveCalls).toBe(1)
    expect(state.createCalls).toBe(0)
  })

  it('即使不做一致性核对而误调 createConnection 会抛 already exists —— 复用分支正是为了避开它', async () => {
    state.existing = true
    state.createThrows = true
    // 复用分支不碰 createConnection，因此不会抛
    await expect(getOfflineDb()).resolves.toBeTruthy()
    expect(state.createCalls).toBe(0)
  })

  it('同一 JS 上下文内重复调用只初始化一次（模块级缓存）', async () => {
    await getOfflineDb()
    await getOfflineDb()
    expect(state.createCalls).toBe(1)
  })

  it('关闭后再取会重新走一遍（不会复用已关闭的连接对象）', async () => {
    await getOfflineDb()
    await closeOfflineDb()
    state.existing = true
    await getOfflineDb()
    expect(state.retrieveCalls).toBe(1)
  })
})
