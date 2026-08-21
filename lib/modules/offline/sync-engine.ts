/**
 * 同步引擎（Stage 3.4）：
 * - 网络恢复/启动时自动触发 sync
 * - 失败项指数退避重试（30s 起，2^n 倍，上限 6 次≈32min）
 * - 逐条回放 PENDING 队列：成功移除、失败累加重试
 */
import { SyncQueue } from './sync-queue'
import { onNetworkChange } from './native/network'
import { isNativePlatform } from './platform'
import type { SyncDispatcher } from './sync-dispatcher'
import type { PullDispatcher } from './pull-dispatcher'
import { pullEntityTypes } from './pull'
import { markEntitySynced } from './local-write'

const BASE_RETRY_MS = 30_000

/** 首期下载拉取的实体类型（D-4 首期离线读范围：碎碎念 / 旅行 / 相册） */
const PULL_ENTITY_TYPES = ['MOMENT', 'TRAVEL', 'ALBUM'] as const

export class SyncEngine {
  private running = false
  private syncing = false
  private unsubscribers: Array<() => void> = []

  constructor(
    private queue: SyncQueue,
    private dispatcher: SyncDispatcher,
    private puller?: PullDispatcher,
  ) {}

  /** 启动：订阅网络变化 + 立即同步一次 */
  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    if (isNativePlatform()) {
      const off = await onNetworkChange((state) => {
        if (state.connected) void this.sync()
      })
      this.unsubscribers.push(off)
    } else if (typeof window !== 'undefined') {
      const handler = () => { void this.sync() }
      window.addEventListener('online', handler)
      this.unsubscribers.push(() => window.removeEventListener('online', handler))
    }
    void this.sync()
  }

  stop(): void {
    this.running = false
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []
  }

  /** 执行一轮同步（重试到期失败项 → 回放待上传 → 下载拉取远端） */
  async sync(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      await this.requeueDue()
      await this.uploadPending()
      await this.pullRemote()
    } finally {
      this.syncing = false
    }
  }

  /** 下载拉取（3.4b）：远端列表 → 本地 SQLite，LWW 落地 */
  private async pullRemote(): Promise<void> {
    if (!this.puller || !isNativePlatform()) return
    await pullEntityTypes(this.puller, [...PULL_ENTITY_TYPES])
  }

  /** 指数退避：到期的 FAILED 项回到 PENDING */
  private async requeueDue(): Promise<void> {
    const all = await this.queue.all()
    const now = Date.now()
    for (const item of all) {
      if (item.status !== 'FAILED') continue
      const delay = BASE_RETRY_MS * Math.pow(2, Math.min(item.retryCount, 6))
      if (now - item.updatedAt >= delay) {
        await this.queue.retry(item.id)
      }
    }
  }

  /** 逐条回放 PENDING */
  private async uploadPending(): Promise<void> {
    const pending = await this.queue.pending()
    for (const item of pending) {
      await this.queue.markSyncing(item.id)
      try {
        const result = await this.dispatcher.upload(item)
        if (result.remoteId != null && item.remoteId == null) {
          await this.queue.setRemoteId(item.id, result.remoteId)
        }
        await this.queue.markDone(item.id)
        // 上传成功：回写本地实体 syncStatus=SYNCED + 回填 remoteId（否则拉取会一直跳过该行）
        await markEntitySynced(item.entityType, item.entityId, result.remoteId ?? item.remoteId)
      } catch (e) {
        await this.queue.markFailed(item.id, e instanceof Error ? e.message : '同步失败')
      }
    }
  }
}
