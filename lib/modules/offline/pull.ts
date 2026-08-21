/**
 * 下载拉取落地（Stage 3.4b）：
 * 把 PullDispatcher 拉到的远端记录 upsert 进本地 SQLite，冲突用 LWW（updatedAt）。
 * 规则：
 *   - 本地 syncStatus = PENDING_UPLOAD（有未上传改动）→ 跳过，不覆盖本地
 *   - 本地 updatedAt 更新 → 跳过（本地更胜）
 *   - 其余情况 → 远端覆盖本地（syncStatus = SYNCED）
 * 仅原生端生效；Web 不启用离线，直接 return。
 */
import { getOfflineDb, toRows } from './native/sqlite-db'
import { isNativePlatform } from './platform'
import type { PullDispatcher, PullEntity } from './pull-dispatcher'
import type { EntityType } from './types'

/** 落地一条远端记录；返回 true 表示写入了本地 */
export async function applyPullEntity(entity: PullEntity): Promise<boolean> {
  if (!isNativePlatform()) return false
  const db = await getOfflineDb()

  // 按 id 或 remoteId 匹配：本地新建（UUID id + 已回填 remoteId）也能被命中，避免同实体分裂成两行
  const existing = toRows(
    await db.query('SELECT id, updatedAt, syncStatus FROM ' + entity.table + ' WHERE id = ? OR remoteId = ? LIMIT 1', [
      entity.id,
      entity.remoteId,
    ]),
  )
  if (existing[0]) {
    const [localId, localUpdatedAt, localSyncStatus] = existing[0]
    const syncStatus = String(localSyncStatus)
    if (syncStatus === 'PENDING_UPLOAD') return false // 本地有待上传改动，跳过
    if (Number(localUpdatedAt) > entity.updatedAt) return false // 本地更新（LWW）

    const fields: Record<string, unknown> = {
      ...entity.data,
      remoteId: entity.remoteId,
      updatedAt: entity.updatedAt,
      syncStatus: 'SYNCED',
      deleted: 0,
    }
    const keys = Object.keys(fields)
    const sets = keys.map((c) => c + ' = ?').join(', ')
    await db.run('UPDATE ' + entity.table + ' SET ' + sets + ' WHERE id = ?', [...keys.map((c) => fields[c]), String(localId)])
    return true
  }

  // 新增
  const full: Record<string, unknown> = {
    ...entity.data,
    id: entity.id,
    remoteId: entity.remoteId,
    updatedAt: entity.updatedAt,
    syncStatus: 'SYNCED',
    deleted: 0,
  }
  const cols = Object.keys(full)
  const placeholders = cols.map(() => '?').join(', ')
  await db.run(
    'INSERT INTO ' + entity.table + ' (' + cols.join(', ') + ') VALUES (' + placeholders + ')',
    cols.map((c) => full[c]),
  )
  return true
}

/** 拉取并落地一组实体类型 */
export async function pullEntityTypes(dispatcher: PullDispatcher, entityTypes: EntityType[]): Promise<number> {
  if (!isNativePlatform()) return 0
  let written = 0
  for (const type of entityTypes) {
    const entities = await dispatcher.pull(type)
    for (const entity of entities) {
      if (await applyPullEntity(entity)) written += 1
    }
  }
  return written
}
