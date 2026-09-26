/**
 * SyncQueue：离线写操作的同步队列（Stage 3.2）。
 * 写流程：本地写 → UI 立即更新（乐观）→ 入队 → 联网逐条上传 → 失败指数退避重试。
 * 本文件定义队列语义 + 存储接口 + 内存实现；原生 SQLite 实现随后接入（3.2 收尾）。
 */
import type { EntityType, SyncOperation, SyncQueueItem, QueueStatus } from './types'

export interface EnqueueInput {
  entityType: EntityType
  entityId: string | null
  remoteId: number | null
  operation: SyncOperation
  payload: unknown
}

export interface SyncQueueStorage {
  add(item: Omit<SyncQueueItem, 'id'>): Promise<number>
  list(status?: QueueStatus): Promise<SyncQueueItem[]>
  update(id: number, patch: Partial<SyncQueueItem>): Promise<void>
  remove(id: number): Promise<void>
}

export class SyncQueue {
  constructor(private storage: SyncQueueStorage) {}

  /** 入队：本地写完成后调用 */
  async enqueue(input: EnqueueInput): Promise<number> {
    const now = Date.now()
    return this.storage.add({
      entityType: input.entityType,
      entityId: input.entityId,
      remoteId: input.remoteId,
      operation: input.operation,
      payload: JSON.stringify(input.payload ?? {}),
      retryCount: 0,
      status: 'PENDING',
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  /** 取待同步项（PENDING） */
  async pending(): Promise<SyncQueueItem[]> {
    return this.storage.list('PENDING')
  }

  /** 取全部（供同步中心统计） */
  async all(): Promise<SyncQueueItem[]> {
    return this.storage.list()
  }

  /** 标记同步中 */
  async markSyncing(id: number): Promise<void> {
    await this.storage.update(id, { status: 'SYNCING', updatedAt: Date.now() })
  }

  /** 同步成功：移出队列 */
  async markDone(id: number): Promise<void> {
    await this.storage.remove(id)
  }

  /**
   * 按本地实体 id 清掉队列项（**在线直写成功后必须调用**）。
   *
   * 为什么关键：`writeLocalEntity` 会同时「写本地 + 入队」。如果这次写已经直接
   * 落到服务端成功，而队列项还留着，`SyncEngine` 稍后会**再上传一次** →
   * 同一本旅行/同一条回忆出现两份（旅行会表现为"标题"与"标题-2"两本）。
   * 这个二次上传在 1.16.2/1.16.3 的"在线优先"改造里被引入过，属高危。
   */
  async markDoneByEntityId(entityId: string | null | undefined): Promise<void> {
    if (!entityId) return
    const items = await this.storage.list()
    for (const it of items) {
      if (it.entityId === entityId) await this.storage.remove(it.id)
    }
  }

  /** 同步失败：累加重试次数 + 记录错误 */
  async markFailed(id: number, error: string): Promise<void> {
    const items = await this.storage.list()
    const item = items.find((i) => i.id === id)
    if (!item) return
    await this.storage.update(id, {
      status: 'FAILED',
      retryCount: item.retryCount + 1,
      lastError: error,
      updatedAt: Date.now(),
    })
  }

  /** 一键重试：失败项回到 PENDING */
  async retry(id: number): Promise<void> {
    await this.storage.update(id, { status: 'PENDING', lastError: null, updatedAt: Date.now() })
  }

  /** 同步成功后回填云端主键（本地新建记录） */
  async setRemoteId(id: number, remoteId: number): Promise<void> {
    await this.storage.update(id, { remoteId })
  }

  /** 统计各状态数量（供同步中心 UI） */
  async stats(): Promise<Record<QueueStatus, number>> {
    const items = await this.storage.list()
    const acc: Record<QueueStatus, number> = { PENDING: 0, SYNCING: 0, FAILED: 0 }
    for (const item of items) acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }
}

/** Web / 测试用内存实现（浏览器端不启用离线；原生端替换为 SQLite 实现） */
export class InMemorySyncQueueStorage implements SyncQueueStorage {
  private items = new Map<number, SyncQueueItem>()
  private seq = 0

  async add(item: Omit<SyncQueueItem, 'id'>): Promise<number> {
    const id = ++this.seq
    this.items.set(id, { ...item, id })
    return id
  }

  async list(status?: QueueStatus): Promise<SyncQueueItem[]> {
    const all = Array.from(this.items.values())
    return status ? all.filter((i) => i.status === status) : all
  }

  async update(id: number, patch: Partial<SyncQueueItem>): Promise<void> {
    const item = this.items.get(id)
    if (!item) return
    this.items.set(id, { ...item, ...patch })
  }

  async remove(id: number): Promise<void> {
    this.items.delete(id)
  }
}
