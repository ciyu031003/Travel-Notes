/**
 * SQLite 版同步队列存储（Stage 3.2 收尾）。
 * 原生端把 SyncQueue 落到 SQLite，替换 Web 端的内存实现。
 */
import type { SyncQueueItem, QueueStatus } from '../types'
import type { SyncQueueStorage } from '../sync-queue'
import { getOfflineDb, toRows, rowGet, type Row } from './sqlite-db'

const COLS = 'id, entityType, entityId, remoteId, operation, payload, retryCount, status, lastError, createdAt, updatedAt'

/**
 * 行 → 队列项。
 * **按列名取值**（`rowGet`）而不是按位置解构：Android 返回的是列名对象，
 * 键序不能假定（org.json 实现细节），按位置取会读到错列甚至 undefined。
 */
function mapRow(row: Row): SyncQueueItem {
  return {
    id: Number(rowGet(row, 'id')),
    entityType: String(rowGet(row, 'entityType')) as SyncQueueItem['entityType'],
    entityId: rowGet(row, 'entityId') == null ? null : String(rowGet(row, 'entityId')),
    remoteId: rowGet(row, 'remoteId') == null ? null : Number(rowGet(row, 'remoteId')),
    operation: String(rowGet(row, 'operation')) as SyncQueueItem['operation'],
    payload: String(rowGet(row, 'payload')),
    retryCount: Number(rowGet(row, 'retryCount')),
    status: String(rowGet(row, 'status')) as QueueStatus,
    lastError: rowGet(row, 'lastError') == null ? null : String(rowGet(row, 'lastError')),
    createdAt: Number(rowGet(row, 'createdAt')),
    updatedAt: Number(rowGet(row, 'updatedAt')),
  }
}

export class SqliteSyncQueueStorage implements SyncQueueStorage {
  async add(item: Omit<SyncQueueItem, 'id'>): Promise<number> {
    const db = await getOfflineDb()
    await db.run(
      'INSERT INTO sync_queue (entityType, entityId, remoteId, operation, payload, retryCount, status, lastError, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [item.entityType, item.entityId, item.remoteId, item.operation, item.payload, item.retryCount, item.status, item.lastError, item.createdAt, item.updatedAt],
    )
    const res = await db.query('SELECT last_insert_rowid() AS id')
    const rows = toRows(res)
    return rows[0] ? Number(rowGet(rows[0], 'id')) : 0
  }

  async list(status?: QueueStatus): Promise<SyncQueueItem[]> {
    const db = await getOfflineDb()
    const res = status
      ? await db.query('SELECT ' + COLS + ' FROM sync_queue WHERE status = ? ORDER BY createdAt ASC', [status])
      : await db.query('SELECT ' + COLS + ' FROM sync_queue ORDER BY createdAt ASC')
    return toRows(res).map(mapRow)
  }

  async update(id: number, patch: Partial<SyncQueueItem>): Promise<void> {
    const db = await getOfflineDb()
    const sets: string[] = []
    const vals: unknown[] = []
    if (patch.entityId !== undefined) { sets.push('entityId = ?'); vals.push(patch.entityId) }
    if (patch.remoteId !== undefined) { sets.push('remoteId = ?'); vals.push(patch.remoteId) }
    if (patch.retryCount !== undefined) { sets.push('retryCount = ?'); vals.push(patch.retryCount) }
    if (patch.status !== undefined) { sets.push('status = ?'); vals.push(patch.status) }
    if (patch.lastError !== undefined) { sets.push('lastError = ?'); vals.push(patch.lastError) }
    if (patch.updatedAt !== undefined) { sets.push('updatedAt = ?'); vals.push(patch.updatedAt) }
    if (sets.length === 0) return
    vals.push(id)
    await db.run('UPDATE sync_queue SET ' + sets.join(', ') + ' WHERE id = ?', vals)
  }

  async remove(id: number): Promise<void> {
    const db = await getOfflineDb()
    await db.run('DELETE FROM sync_queue WHERE id = ?', [id])
  }
}
