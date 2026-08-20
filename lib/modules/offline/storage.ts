/**
 * 离线存储工厂（Stage 3.2 收尾）。
 * 原生端走 SQLite，Web 端走内存（Web 不启用离线，继续走网络 API）。
 */
import { isNativePlatform } from './platform'
import { SyncQueueStorage, InMemorySyncQueueStorage } from './sync-queue'
import { SqliteSyncQueueStorage } from './native/sqlite-sync-queue'

let queueStorage: SyncQueueStorage | null = null

export function getSyncQueueStorage(): SyncQueueStorage {
  if (queueStorage) return queueStorage
  queueStorage = isNativePlatform() ? new SqliteSyncQueueStorage() : new InMemorySyncQueueStorage()
  return queueStorage
}

/** 测试/登出时重置 */
export function resetSyncQueueStorage(): void {
  queueStorage = null
}
