/**
 * 离线同步引擎启动引导（Stage 3.4b 接线）：
 * 原生壳启动时初始化 SyncEngine（队列 + 上传分发 + 下载拉取），
 * 联网即自动回放待上传 + 拉取远端到本地 SQLite，供页面 readWithFallback 离线读。
 * Web 端 isNativePlatform()=false，直接 no-op。
 */
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { HttpSyncDispatcher } from './sync-dispatcher'
import { HttpPullDispatcher } from './pull-dispatcher'
import { SyncEngine } from './sync-engine'
import { isNativePlatform } from './platform'

let engine: SyncEngine | null = null

export async function startSyncEngine(): Promise<void> {
  if (!isNativePlatform() || engine) return
  const queue = new SyncQueue(getSyncQueueStorage())
  const engine_ = new SyncEngine(queue, new HttpSyncDispatcher(), new HttpPullDispatcher())
  engine = engine_
  await engine_.start()
}

export function stopSyncEngine(): void {
  engine?.stop()
  engine = null
}

export function getSyncEngine(): SyncEngine | null {
  return engine
}
