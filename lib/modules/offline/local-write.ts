/**
 * 本地乐观写 + 入队（Stage 3.4）。
 * 离线写统一入口：先写本地 SQLite（乐观、标记 PENDING_UPLOAD），再入 SyncQueue。
 * 仅原生端生效；Web 不启用离线写，直接 return。
 */
import { getOfflineDb, tableColumns } from './native/sqlite-db'
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
    /**
     * 只写"表里真实存在的列"。
     *
     * 为什么：老设备的 SQLite 是靠 `CREATE TABLE IF NOT EXISTS` 建的，新增列必须先 ALTER
     * （见 sqlite-db 的自省自愈）。若某列仍缺失，带上它的 INSERT 会**整条抛错** ——
     * 表现就是「新建旅行直接失败」。这里退一步：缺列就跳过该字段（队列 payload 仍带全量，
     * 云端不受影响），保证本地写入永远不因列漂移而彻底失败。
     */
    const actual = await tableColumns(db, input.table)
    const allCols = Object.keys(full)
    const cols = actual ? allCols.filter((c) => actual.has(c)) : allCols
    if (actual && cols.length < allCols.length) {
      const skipped = allCols.filter((c) => !actual.has(c))
      console.warn('[offline] 本地表缺列，已跳过写入：', input.table, skipped.join(', '))
    }
    if (cols.length === 0) throw new Error('[offline] 本地表无可用列：' + input.table)
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
  SOCIAL_POST: 'social_post',
  COMMENT: 'comment',
  LIKE: 'like',
  FAVORITE: 'favorite',
}

/**
 * 上传成功后回写本地实体：syncStatus → SYNCED + 回填 remoteId。
 * 不动 updatedAt（保持最后一次真实编辑时间），供后续 LWW 拉取比较。
 *
 * `remoteSlug`：服务器可能重算 slug（唯一性冲突时加后缀），回填后本地链接才与云端一致。
 * 只对 travel 生效（当前只有它有 slug 语义）。
 */
export async function markEntitySynced(
  entityType: EntityType,
  entityId: string | null,
  remoteId: number | null,
  remoteSlug?: string | null,
): Promise<void> {
  if (!isNativePlatform() || !entityId) return
  const table = ENTITY_TABLE[entityType]
  if (!table) return
  const db = await getOfflineDb()
  await db.run(
    'UPDATE ' + table + ' SET syncStatus = ?, remoteId = COALESCE(?, remoteId) WHERE id = ?',
    ['SYNCED', remoteId, entityId],
  )
  if (entityType === 'TRAVEL' && remoteSlug) {
    // slug 单独更新：列不存在时（极旧库）静默跳过，不影响同步结果
    await db
      .run('UPDATE travel SET slug = ? WHERE id = ?', [remoteSlug, entityId])
      .catch(() => {})
  }
}
