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

/** 下载拉取的实体类型（D-4 首期离线读范围：碎碎念 / 旅行 / 相册 + D2 旅行圈 Feed） */
const PULL_ENTITY_TYPES = ['MOMENT', 'TRAVEL', 'ALBUM', 'SOCIAL_POST'] as const

export class SyncEngine {
  private running = false
  private syncing = false
  private unsubscribers: Array<() => void> = []

  /** v3.1 M4-C1：最近一次同步统计（供同步中心展示） */
  lastSyncStats: { at: number; written: number } | null = null

  /** 最近一次同步里被隔离的阶段错误（供同步中心/诊断展示；不阻断同步） */
  lastError: string | null = null

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

  /**
   * 执行一轮同步（**先上传，再退避，再拉取**，各阶段互相隔离）。
   *
   * 顺序与隔离都是刻意的，源自一个真实故障：
   * 原先的顺序是 `requeueDue() → uploadPending() → pullRemote()`，
   * 而 `requeueDue` 第一步就读本地队列（`queue.all()`）。设备上本地 SQLite 一旦异常，
   * 这一步就抛错 → 整个 `sync()` 中断 → **`uploadPending()` 永远执行不到**
   *   → 用户创作的内容永远到不了云端（线上库 `Travel=0` 就是这个后果），
   *   而 `void this.sync()` 把 rejection 吞掉，界面上完全无声。
   *
   * 因此：① 用户内容优先上传，本地存储坏了也不能挡住它；
   *       ② 每个阶段独立 try/catch，任一阶段失败不影响其他阶段；
   *       ③ 错误记录到 lastError，便于线上定位。
   */
  async sync(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    this.lastError = null
    try {
      await this.guard('uploadPending', () => this.uploadPending())
      await this.guard('requeueDue', () => this.requeueDue())
      const written = (await this.guard('pullRemote', () => this.pullRemote())) ?? 0
      this.lastSyncStats = { at: Date.now(), written }
    } finally {
      this.syncing = false
    }
  }

  /** 阶段隔离：单个阶段失败只记录，不中断整轮同步 */
  private async guard<T>(phase: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.lastError = `${phase}: ${msg}`
      console.warn(`[sync] 阶段 ${phase} 失败（已隔离，不影响其他阶段）:`, msg)
      return undefined
    }
  }

  /** 下载拉取（3.4b）：远端列表 → 本地 SQLite，LWW 落地；返回写入条数 */
  private async pullRemote(): Promise<number> {
    if (!this.puller || !isNativePlatform()) return 0
    return pullEntityTypes(this.puller, [...PULL_ENTITY_TYPES])
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
      let uploaded: { remoteId?: number | null; slug?: string } | null = null
      try {
        await this.queue.markSyncing(item.id)
        uploaded = await this.dispatcher.upload(item)
      } catch (e) {
        await this.queue.markFailed(item.id, e instanceof Error ? e.message : '同步失败').catch(() => {})
        continue
      }
      /**
       * 上传**已经成功**了：之后的本地回写（回填 remoteId / 出队 / 标记 SYNCED）
       * 即便失败，也绝不能让它退化成"留在队列里" —— 否则下一轮会**重复上传**，
       * 用户就会看到两本同名旅行（"标题"与"标题-2"）。
       * 所以这段单独 try/catch：失败只记日志，不改变"已上传"的事实。
       */
      try {
        if (uploaded.remoteId != null && item.remoteId == null) {
          await this.queue.setRemoteId(item.id, uploaded.remoteId)
        }
        await this.queue.markDone(item.id)
        // 回写本地实体 syncStatus=SYNCED + remoteId（否则拉取会一直跳过该行）
        await markEntitySynced(item.entityType, item.entityId, uploaded.remoteId ?? item.remoteId, uploaded.slug)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.lastError = `bookkeep: ${msg}`
        console.warn('[sync] 上传已成功，但本地回写失败（不会重传，仅本地状态可能滞后）:', msg)
      }
    }
  }
}
