import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * B4：客户端增量拉取 + 墓碑应用 + 游标推进。
 *
 * 契约：
 *  · pullChanges 优先：带 syncCursor 请求 /api/sync/changes；404/失败返回 null（回退全量）；
 *  · 墓碑 → 删除本地行（PENDING_UPLOAD 的本地改动不删，等上传后再清）；
 *  · 游标只在全部变更处理成功后推进到服务端 serverTime（不是客户端 now）；
 *  · 无 pullChanges 的 dispatcher → pullIncremental 返回 null（老路径不变）。
 */
const { dbMock, metaMock } = vi.hoisted(() => ({
  dbMock: { query: vi.fn(), run: vi.fn() },
  metaMock: { getMeta: vi.fn(), setMeta: vi.fn(), deleteMeta: vi.fn() },
}))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))
vi.mock('@/lib/modules/offline/meta', () => ({
  getMeta: metaMock.getMeta,
  setMeta: metaMock.setMeta,
  deleteMeta: metaMock.deleteMeta,
  META_KEYS: { accountId: 'accountId', lastSyncAt: 'lastSyncAt', syncCursor: 'syncCursor' },
}))
vi.mock('@/lib/modules/offline/native/sqlite-db', () => ({
  getOfflineDb: async () => dbMock,
  toRows: (res: { values?: unknown[] }) => res?.values ?? [],
  rowGet: (row: Record<string, unknown> | null, name: string) => (row ? row[name] : undefined),
  tableColumns: async () => new Set(['content', 'tags', 'userId', 'isPublic', 'updatedAt', 'syncStatus', 'deleted', 'id', 'remoteId']),
}))

import { pullIncremental, applyPullTombstone } from '@/lib/modules/offline/pull'
import { HttpPullDispatcher } from '@/lib/modules/offline/pull-dispatcher'

beforeEach(() => {
  vi.clearAllMocks()
  metaMock.getMeta.mockResolvedValue(null)
  metaMock.setMeta.mockResolvedValue(undefined)
  dbMock.run.mockResolvedValue(undefined)
})

describe('applyPullTombstone', () => {
  it('命中本地行且已同步 → 删主行并清子表', async () => {
    dbMock.query.mockResolvedValue({ values: [{ id: 'local-9', syncStatus: 'SYNCED' }] })
    const removed = await applyPullTombstone({ entityType: 'Memory', entityId: 9 })
    expect(removed).toBe(true)
    const sqls = dbMock.run.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => s.includes('DELETE FROM memory_media'))).toBe(true)
    // 不删 media：服务端删回忆只解除关联，照片可能仍属于其它回忆/相册
    expect(sqls.some((s) => s.includes('DELETE FROM media'))).toBe(false)
    expect(sqls.some((s) => s.startsWith('DELETE FROM memory WHERE id'))).toBe(true)
  })

  it('本地行有待上传改动 → 保留本地行（不删）', async () => {
    dbMock.query.mockResolvedValue({ values: [{ id: 'local-9', syncStatus: 'PENDING_UPLOAD' }] })
    const removed = await applyPullTombstone({ entityType: 'Travel', entityId: 9 })
    expect(removed).toBe(false)
    expect(dbMock.run).not.toHaveBeenCalled()
  })

  it('本地没有该行 → 直接返回 false', async () => {
    dbMock.query.mockResolvedValue({ values: [] })
    await expect(applyPullTombstone({ entityType: 'Album', entityId: 77 })).resolves.toBe(false)
  })
})

describe('pullIncremental', () => {
  it('实体 upsert + 墓碑删除 + 游标推进到 serverTime', async () => {
    // applyPullEntity 查本地无该行 → INSERT
    dbMock.query.mockResolvedValue({ values: [] })
    const dispatcher = {
      pull: vi.fn(),
      pullChanges: vi.fn(async () => ({
        serverTime: 1712345678000,
        entities: [
          { table: 'moment', id: '5', remoteId: 5, updatedAt: 1712345677000, data: { content: 'hi' } },
        ],
        tombstones: [] as Array<{ entityType: 'Travel'; entityId: number }>,
      })),
    }

    const written = await pullIncremental(dispatcher as never)
    expect(written).toBe(1)
    expect(dispatcher.pull).not.toHaveBeenCalled() // 不再走全量列表接口
    expect(metaMock.setMeta).toHaveBeenCalledWith('syncCursor', 1712345678000)
    expect(metaMock.setMeta).toHaveBeenCalledWith('lastSyncAt', 1712345678000)
    const insert = dbMock.run.mock.calls.find((c) => String(c[0]).includes('INSERT INTO moment'))
    expect(insert).toBeTruthy()
  })

  it('墓碑应用成功也计入写入数', async () => {
    dbMock.query.mockResolvedValue({ values: [{ id: 'local-3', syncStatus: 'SYNCED' }] })
    const dispatcher = {
      pull: vi.fn(),
      pullChanges: vi.fn(async () => ({
        serverTime: 111,
        entities: [],
        tombstones: [{ entityType: 'Travel' as const, entityId: 3 }],
      })),
    }
    const written = await pullIncremental(dispatcher as never)
    expect(written).toBe(1)
  })

  it('服务端 404/失败（pullChanges → null）→ 返回 null 交由调用方回退全量', async () => {
    const dispatcher = { pull: vi.fn(), pullChanges: vi.fn(async () => null) }
    await expect(pullIncremental(dispatcher as never)).resolves.toBeNull()
    expect(metaMock.setMeta).not.toHaveBeenCalled()
  })

  it('dispatcher 没有 pullChanges（老实现）→ null（全量路径不变）', async () => {
    const dispatcher = { pull: vi.fn(async () => []) }
    await expect(pullIncremental(dispatcher as never)).resolves.toBeNull()
  })
})

describe('HttpPullDispatcher.pullChanges', () => {
  it('带 syncCursor 请求增量端点并映射四类实体与墓碑', async () => {
    metaMock.getMeta.mockImplementation(async (key: string) => (key === 'syncCursor' ? '1712345678000' : null))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        serverTime: '2026-04-05T12:00:00.500Z',
        travels: [{ id: 1, title: '南京', updatedAt: '2026-04-05T00:00:00.000Z' }],
        moments: [{ id: 2, content: 'hi', tags: ['旅行'], updatedAt: '2026-04-05T00:00:00.000Z' }],
        albums: [],
        memories: [{ id: 3, title: 'm', updatedAt: '2026-04-05T00:00:00.000Z' }],
        tombstones: [
          { entityType: 'Travel', entityId: 1 },
          { entityType: 'Bogus', entityId: 2 },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const changes = await new HttpPullDispatcher().pullChanges()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('updatedSince=1712345678000')
    expect(changes).not.toBeNull()
    expect(changes!.entities.map((e) => e.table).sort()).toEqual(['memory', 'moment', 'travel'])
    expect(changes!.tombstones).toEqual([{ entityType: 'Travel', entityId: 1 }])
    expect(changes!.serverTime).toBe(new Date('2026-04-05T12:00:00.500Z').getTime())
    vi.unstubAllGlobals()
  })

  it('服务端 404 → null（回退全量）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    await expect(new HttpPullDispatcher().pullChanges()).resolves.toBeNull()
    vi.unstubAllGlobals()
  })
})
