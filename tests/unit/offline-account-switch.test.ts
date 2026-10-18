/**
 * 账号隔离（P1-22）回归。
 *
 * 锁住三件事：
 *  ① 清库覆盖所有本地表（少一张表 = 换账号后仍能看到那个模块的旧数据）；
 *  ② 登出清理会删媒体文件、关连接、重置队列单例；
 *  ③ accountId 变化时 ensureOfflineAccountScope 会清库并重新认领；一致时不动数据。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const box = vi.hoisted(() => ({
  db: null as unknown,
  runs: [] as Array<{ sql: string; values?: unknown[] }>,
  storedAccount: null as string | null,
  deletedFiles: [] as string[],
}))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))

vi.mock('@/lib/modules/offline/native/sqlite-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/modules/offline/native/sqlite-db')>()
  return {
    ...actual,
    getOfflineDb: async () => box.db,
    closeOfflineDb: async () => {},
  }
})

vi.mock('@/lib/modules/offline/native/filesystem', () => ({
  listLocalFiles: async () => ['a.jpg', 'b.jpg'],
  deleteLocalFile: async (p: string) => { box.deletedFiles.push(p) },
  deleteLocalDir: async () => {},
}))

function android(values: Array<Record<string, unknown>>) {
  return { values }
}

function makeDb() {
  return {
    query: async (sql: string) => {
      if (sql.includes('FROM meta')) {
        return box.storedAccount == null ? android([]) : android([{ value: box.storedAccount }])
      }
      return android([])
    },
    run: async (sql: string, values?: unknown[]) => {
      box.runs.push({ sql, values })
      return { changes: { changes: 1 } }
    },
    execute: async () => {},
  }
}

import { clearOfflineData, purgeOfflineForLogout, OFFLINE_DATA_TABLES } from '@/lib/modules/offline/reset'
import { ensureOfflineAccountScope, resetAccountScopeCache } from '@/lib/modules/offline/account-scope'

beforeEach(() => {
  box.db = makeDb()
  box.runs = []
  box.storedAccount = null
  box.deletedFiles = []
  resetAccountScopeCache()
  vi.restoreAllMocks()
})

describe('P1-22 · 清库覆盖所有本地表', () => {
  it('clearOfflineData 会 DELETE 每一张业务表（含 sync_queue 与 meta）', async () => {
    const result = await clearOfflineData()
    const sqls = box.runs.map((r) => r.sql)
    for (const table of OFFLINE_DATA_TABLES) {
      expect(sqls, '缺少对 ' + table + ' 的清理（换账号会残留）').toContain('DELETE FROM ' + table)
    }
    expect(result.clearedTables.length).toBe(OFFLINE_DATA_TABLES.length)
  })

  it('purgeOfflineForLogout 同时删媒体文件并重置队列单例', async () => {
    const result = await purgeOfflineForLogout()
    expect(result.mediaFiles).toBe(2)
    expect(box.deletedFiles).toEqual(['media/a.jpg', 'media/b.jpg'])
    expect(box.runs.some((r) => r.sql === 'DELETE FROM sync_queue')).toBe(true)
  })
})

describe('P1-22 · 账号不一致触发清理', () => {
  it('本地归属 A、当前登录 B → 清库并把 accountId 写成 B', async () => {
    box.storedAccount = '1'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { id: 2 } }) })))

    const result = await ensureOfflineAccountScope({ force: true })

    expect(result).toBe('switched')
    expect(box.runs.some((r) => r.sql === 'DELETE FROM travel')).toBe(true)
    const metaWrite = box.runs.find((r) => r.sql.includes('INSERT INTO meta'))
    expect(metaWrite?.values?.[1]).toBe('2')
    vi.unstubAllGlobals()
  })

  it('账号一致 → 返回 ok 且不清库', async () => {
    box.storedAccount = '2'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { id: 2 } }) })))

    const result = await ensureOfflineAccountScope({ force: true })

    expect(result).toBe('ok')
    expect(box.runs.some((r) => r.sql.startsWith('DELETE FROM'))).toBe(false)
    vi.unstubAllGlobals()
  })

  it('老库无 accountId → 认领但**不清库**（升级不能白丢离线缓存）', async () => {
    box.storedAccount = null
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { id: 7 } }) })))

    const result = await ensureOfflineAccountScope({ force: true })

    expect(result).toBe('adopted')
    expect(box.runs.some((r) => r.sql.startsWith('DELETE FROM'))).toBe(false)
    vi.unstubAllGlobals()
  })

  it('未登录（/api/me 非 2xx）→ skipped，绝不清库', async () => {
    box.storedAccount = '1'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))

    const result = await ensureOfflineAccountScope({ force: true })

    expect(result).toBe('skipped')
    expect(box.runs.some((r) => r.sql.startsWith('DELETE FROM'))).toBe(false)
    vi.unstubAllGlobals()
  })
})
