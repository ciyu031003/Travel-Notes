/**
 * 本地乐观写 + 入队（Stage 3.4）。
 * 离线写统一入口：先写本地 SQLite（乐观、标记 PENDING_UPLOAD），再入 SyncQueue。
 * 仅原生端生效；Web 不启用离线写，直接 return。
 */
import { getOfflineDb } from './native/sqlite-db'
import { isNativePlatform } from './platform'
import { SyncQueue } from './sync-queue'
import type { EntityType, SyncOperation } from './types'

export interface LocalWriteInput {
  table: string
  id: string
  entityType: EntityType
  remoteId: number | null
  operation: SyncOperation
  data: Record<string, unknown>
}

export async function writeLocalEntity(input: LocalWriteInput, queue: SyncQueue): Promise<void> {
  if (!isNativePlatform()) return

  const db = await getOfflineDb()
  const now = Date.now()

  if (input.operation === 'DELETE') {
    await db.run('UPDATE ' + input.table + ' SET deleted = 1, syncStatus = ?, updatedAt = ? WHERE id = ?', ['PENDING_UPLOAD', now, input.id])
  } else {
    const full: Record<string, unknown> = { ...input.data, id: input.id, syncStatus: 'PENDING_UPLOAD', updatedAt: now, deleted: 0 }
    const cols = Object.keys(full)
    const placeholders = cols.map(() => '?').join(', ')
    const updates = cols.map((c) => c + ' = excluded.' + c).join(', ')
    const sql = 'INSERT INTO ' + input.table + ' (' + cols.join(', ') + ') VALUES (' + placeholders + ') ON CONFLICT(id) DO UPDATE SET ' + updates
    await db.run(sql, cols.map((c) => full[c]))
  }

  await queue.enqueue({
    entityType: input.entityType,
    entityId: input.id,
    remoteId: input.remoteId,
    operation: input.operation,
    payload: input.data,
  })
}

/** 实体类型 → 本地表名（离线写 + 同步回写共用） */
export const ENTITY_TABLE: Record<EntityType, string> = {
  TRAVEL: 'travel',
  TRAVEL_DAY: 'travel_day',
  MEMORY: 'memory',
  MEDIA: 'media',
  ALBUM: 'album',
  ALBUM_MEDIA: 'album_media',
  MOMENT: 'moment',
  COMMENT: 'comment',
  LIKE: 'like',
  FAVORITE: 'favorite',
}

/**
 * 上传成功后回写本地实体：syncStatus → SYNCED + 回填 remoteId。
 * 不动 updatedAt（保持最后一次真实编辑时间），供后续 LWW 拉取比较。
 */
export async function markEntitySynced(entityType: EntityType, entityId: string | null, remoteId: number | null): Promise<void> {
  if (!isNativePlatform() || !entityId) return
  const table = ENTITY_TABLE[entityType]
  if (!table) return
  const db = await getOfflineDb()
  await db.run(
    'UPDATE ' + table + ' SET syncStatus = ?, remoteId = COALESCE(?, remoteId) WHERE id = ?',
    ['SYNCED', remoteId, entityId],
  )
}
