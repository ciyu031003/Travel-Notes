/**
 * B5：本地媒体生命周期（上传后删原图 / 配额 LRU）回归。
 *
 * 用内存文件系统 + 假数据库跑真实逻辑，锁住：
 *  ① 只删"本机上传的原图"（远端缓存图不按上传成功删）；
 *  ② 有缩略图 → localPath 指向缩略图；无缩略图 → 清空；
 *  ③ 维护顺序：先收尾已上传原图，再做配额 LRU；待上传文件永不删；
 *  ④ 维护幂等（同会话只跑一次，force 可再跑）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const box = vi.hoisted(() => ({
  files: new Map<string, { size: number; mtime: number }>(),
  deleted: [] as string[],
  sql: [] as Array<{ sql: string; values?: unknown[] }>,
  mediaRows: [] as Array<{ id: string; localPath: string }>,
  mediaById: {} as Record<string, string>,
  pendingItems: [] as Array<{ operation: string; entityType: string; payload: string }>,
}))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))

vi.mock('@/lib/modules/offline/native/filesystem', () => ({
  listLocalFiles: async (dir: string) =>
    Array.from(box.files.keys())
      .filter((k) => k.startsWith(dir + '/'))
      .map((k) => k.slice(dir.length + 1)),
  statLocalFile: async (p: string) => {
    const f = box.files.get(p)
    return f ? { size: f.size, mtime: f.mtime } : null
  },
  deleteLocalFile: async (p: string) => {
    box.deleted.push(p)
    box.files.delete(p)
  },
  ensureLocalDir: async () => {},
  writeLocalFile: async () => {},
}))

vi.mock('@/lib/modules/offline/native/sqlite-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/modules/offline/native/sqlite-db')>()
  return {
    ...actual,
    getOfflineDb: async () => ({
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes('FROM media WHERE syncStatus')) {
          return { values: box.mediaRows.map((r) => ({ id: r.id, localPath: r.localPath })) }
        }
        if (sql.includes('SELECT localPath FROM media WHERE id')) {
          const id = String(values?.[0] ?? '')
          const localPath = box.mediaById[id]
          return { values: localPath ? [{ localPath }] : [] }
        }
        return { values: [] }
      },
      run: async (sql: string, values?: unknown[]) => {
        box.sql.push({ sql, values })
        return { changes: { changes: 1 } }
      },
    }),
  }
})

vi.mock('@/lib/modules/offline/sync-queue', () => ({
  SyncQueue: class {
    async pending() {
      return box.pendingItems
    }
  },
}))
vi.mock('@/lib/modules/offline/storage', () => ({ getSyncQueueStorage: () => ({}) }))

import {
  finalizeUploadedMedia,
  getMediaStorageStats,
  planLruEviction,
  pruneSyncedOriginals,
  resetMediaMaintenanceForTest,
  runMediaMaintenance,
} from '@/lib/media/local-files'

function addFile(path: string, size: number, mtime = 0) {
  box.files.set(path, { size, mtime })
}

beforeEach(() => {
  box.files.clear()
  box.deleted = []
  box.sql = []
  box.mediaRows = []
  box.mediaById = {}
  box.pendingItems = []
  resetMediaMaintenanceForTest()
})

describe('B5 · 上传成功后收尾原图', () => {
  it('删原图、localPath 换成缩略图', async () => {
    addFile('media/m1.jpg', 1000)
    addFile('media/m1-thumb.jpg', 100)
    box.mediaRows = [{ id: 'm1', localPath: 'media/m1.jpg' }]

    const result = await pruneSyncedOriginals()

    expect(box.deleted).toEqual(['media/m1.jpg'])
    expect(result.deleted).toBe(1)
    expect(result.freedBytes).toBe(1000)
    expect(result.switchedToThumb).toBe(1)
    const update = box.sql.find((s) => s.sql.startsWith('UPDATE media SET localPath = ?'))
    expect(update?.values).toEqual(['media/m1-thumb.jpg', 'm1'])
  })

  it('没有缩略图时把 localPath 清空（下次从远端取）', async () => {
    addFile('media/m2.jpg', 800)
    box.mediaRows = [{ id: 'm2', localPath: 'media/m2.jpg' }]

    const result = await pruneSyncedOriginals()

    expect(box.deleted).toEqual(['media/m2.jpg'])
    expect(result.cleared).toBe(1)
    expect(box.sql.some((s) => s.sql.startsWith('UPDATE media SET localPath = NULL'))).toBe(true)
  })

  it('远端缓存图（文件名主干 != mediaId）不按"上传成功"删', async () => {
    addFile('media/abc123deadbeef.jpg', 2000)
    box.mediaRows = [{ id: 'm3', localPath: 'media/abc123deadbeef.jpg' }]

    const result = await pruneSyncedOriginals()

    expect(box.deleted).toEqual([])
    expect(result.deleted).toBe(0)
  })

  it('已经是缩略图路径的行不动', async () => {
    addFile('media/m4-thumb.jpg', 100)
    box.mediaRows = [{ id: 'm4', localPath: 'media/m4-thumb.jpg' }]

    const result = await pruneSyncedOriginals()

    expect(box.deleted).toEqual([])
    expect(box.sql).toEqual([])
    expect(result.deleted).toBe(0)
  })

  it('finalizeUploadedMedia：单条收尾（删原图 + 指向缩略图）', async () => {
    addFile('media/m9.jpg', 3000)
    addFile('media/m9-thumb.jpg', 120)
    box.mediaById = { m9: 'media/m9.jpg' }

    expect(await finalizeUploadedMedia('m9')).toBe(true)
    expect(box.deleted).toEqual(['media/m9.jpg'])
    expect(box.sql.find((s) => s.sql.startsWith('UPDATE media SET localPath = ?'))?.values).toEqual([
      'media/m9-thumb.jpg',
      'm9',
    ])
  })

  it('finalizeUploadedMedia：已是缩略图 / 未知 id → 不重复删', async () => {
    addFile('media/m9-thumb.jpg', 120)
    box.mediaById = { m9: 'media/m9-thumb.jpg' }
    expect(await finalizeUploadedMedia('m9')).toBe(false)
    expect(await finalizeUploadedMedia('nope')).toBe(false)
    expect(box.deleted).toEqual([])
  })
})

describe('B5 · 启动维护（收尾 + LRU）', () => {
  it('待上传文件不删，最旧的非队列文件先删', async () => {
    addFile('media/queued.jpg', 600, 1) // 最旧，但还在队列里
    addFile('media/old.jpg', 600, 2)
    addFile('media/new.jpg', 600, 3)
    box.pendingItems = [
      { operation: 'UPLOAD_MEDIA', entityType: 'MEDIA', payload: JSON.stringify({ localPath: 'media/queued.jpg' }) },
    ]

    const result = await runMediaMaintenance({ quotaBytes: 700 })

    expect(box.files.has('media/queued.jpg')).toBe(true)
    expect(box.files.has('media/old.jpg')).toBe(false)
    expect(box.files.has('media/new.jpg')).toBe(false)
    expect(result.deletedByEviction).toBe(2)
    expect(result.freedByEviction).toBe(1200)
  })

  it('未超配额时不动任何文件', async () => {
    addFile('media/a.jpg', 100, 1)
    addFile('media/b.jpg', 100, 2)
    const result = await runMediaMaintenance({ quotaBytes: 10_000 })
    expect(box.deleted).toEqual([])
    expect(result.deletedByEviction).toBe(0)
  })

  it('幂等：同会话第二次调用直接空跑；force 可再跑', async () => {
    addFile('media/a.jpg', 100, 1)
    const first = await runMediaMaintenance({ quotaBytes: 10_000 })
    expect(first.ranAt).toBeGreaterThan(0)
    const second = await runMediaMaintenance({ quotaBytes: 10_000 })
    expect(second.pruned.deleted).toBe(0)
    expect(second.eviction.remove).toEqual([])
    const forced = await runMediaMaintenance({ quotaBytes: 10_000, force: true })
    expect(forced.ranAt).toBeGreaterThan(0)
  })

  it('统计：usedBytes / quota / thumb 数量', async () => {
    addFile('media/a.jpg', 1000, 1)
    addFile('media/a-thumb.jpg', 100, 1)
    const stats = await getMediaStorageStats()
    expect(stats.fileCount).toBe(2)
    expect(stats.thumbCount).toBe(1)
    expect(stats.usedBytes).toBe(1100)
    expect(stats.quotaBytes).toBeGreaterThan(0)
    expect(stats.usedRatio).toBeGreaterThan(0)
  })
})

describe('B5 · 纯函数与维护的组合一致性', () => {
  it('planLruEviction 的删除列表与 runMediaMaintenance 实际删除一致', async () => {
    addFile('media/a.jpg', 400, 1)
    addFile('media/b.jpg', 400, 2)
    box.pendingItems = []
    const entries = Array.from(box.files.entries()).map(([path, f]) => ({
      path,
      size: f.size,
      lastUsed: f.mtime,
      queued: false,
    }))
    const plan = planLruEviction(entries, 500)
    const result = await runMediaMaintenance({ quotaBytes: 500 })
    expect(box.deleted.sort()).toEqual(plan.remove.map((e) => e.path).sort())
    expect(result.deletedByEviction).toBe(plan.remove.length)
  })
})
