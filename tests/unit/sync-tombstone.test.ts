import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * B4：同步墓碑 helper + 删除路径接线。
 *
 * 契约：
 *  · 墓碑写入 best-effort：写失败只记日志，绝不阻断删除；
 *  · 删除路径（memory 服务）必须带 entityType/entityId/userId 落一条 SyncTombstone；
 *  · 用户名反查 userId（删除路径多只有 username）失败返回 null。
 */
const { prismaMock, writeAuditLogMock } = vi.hoisted(() => ({
  prismaMock: {
    syncTombstone: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    spaceMember: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
  writeAuditLogMock: vi.fn(async () => {}),
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/modules/audit/audit-log.service', () => ({ writeAuditLog: writeAuditLogMock }))

import { recordSyncTombstone, resolveUserIdByUsername } from '@/lib/api/sync-tombstone'
import { MemoryService } from '@/lib/modules/memory/memory.service'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.syncTombstone.create.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue({ id: 9 })
  prismaMock.spaceMember.findUnique.mockResolvedValue({ id: 1, status: 'ACTIVE', role: 'OWNER' })
})

describe('recordSyncTombstone', () => {
  it('写入 entityType / entityId / userId', async () => {
    await recordSyncTombstone('Travel', 12, 3)
    expect(prismaMock.syncTombstone.create).toHaveBeenCalledWith({
      data: { entityType: 'Travel', entityId: 12, userId: 3 },
    })
  })

  it('userId 缺省写 null（历史数据/无会话上下文）', async () => {
    await recordSyncTombstone('Album', 5)
    expect(prismaMock.syncTombstone.create).toHaveBeenCalledWith({
      data: { entityType: 'Album', entityId: 5, userId: null },
    })
  })

  it('非法 id 直接跳过，不写库', async () => {
    await recordSyncTombstone('Memory', 0)
    await recordSyncTombstone('Memory', Number.NaN)
    expect(prismaMock.syncTombstone.create).not.toHaveBeenCalled()
  })

  it('写入失败不抛出（best-effort，不阻断删除）', async () => {
    prismaMock.syncTombstone.create.mockRejectedValue(new Error('table missing'))
    await expect(recordSyncTombstone('Moment', 3, 1)).resolves.toBeUndefined()
  })
})

describe('resolveUserIdByUsername', () => {
  it('命中返回 id；空用户名/查询失败返回 null', async () => {
    await expect(resolveUserIdByUsername('alice')).resolves.toBe(9)
    await expect(resolveUserIdByUsername(null)).resolves.toBeNull()
    prismaMock.user.findUnique.mockRejectedValue(new Error('db down'))
    await expect(resolveUserIdByUsername('alice')).resolves.toBeNull()
  })
})

describe('删除路径写入墓碑（memory.deleteMemory）', () => {
  it('删除成功后落 SyncTombstone（带 actor userId）', async () => {
    const repo = {
      findById: vi.fn(async () => ({ id: 5, spaceId: 3, createdBy: 'alice' })),
      remove: vi.fn(async () => {}),
    }
    const svc = new MemoryService(repo as never)
    await svc.deleteMemory('alice', 5, 8)
    expect(repo.remove).toHaveBeenCalledWith(5)
    expect(prismaMock.syncTombstone.create).toHaveBeenCalledWith({
      data: { entityType: 'Memory', entityId: 5, userId: 8 },
    })
  })

  it('未传 actorUserId → 回退用 createdBy 反查的 userId', async () => {
    const repo = {
      findById: vi.fn(async () => ({ id: 6, spaceId: 3, createdBy: 'alice' })),
      remove: vi.fn(async () => {}),
    }
    const svc = new MemoryService(repo as never)
    await svc.deleteMemory('alice', 6)
    expect(prismaMock.syncTombstone.create).toHaveBeenCalledWith({
      data: { entityType: 'Memory', entityId: 6, userId: 9 },
    })
  })
})
