/**
 * 下载拉取落地（Stage 3.4b）：
 * 把 PullDispatcher 拉到的远端记录 upsert 进本地 SQLite，冲突用 LWW（updatedAt）。
 * 规则：
 *   - 本地 syncStatus = PENDING_UPLOAD（有未上传改动）→ 跳过，不覆盖本地
 *   - 本地 updatedAt 更新 → 跳过（本地更胜）
 *   - 其余情况 → 远端覆盖本地（syncStatus = SYNCED）
 * 仅原生端生效；Web 不启用离线，直接 return。
 */
import { getOfflineDb, toRows, rowGet, tableColumns } from './native/sqlite-db'
import { isNativePlatform } from './platform'
import type { PullDispatcher, PullEntity } from './pull-dispatcher'
import type { EntityType } from './types'

/** 落地一条远端记录；返回 true 表示写入了本地 */
export async function applyPullEntity(entity: PullEntity): Promise<boolean> {
  if (!isNativePlatform()) return false
  const db = await getOfflineDb()

  /**
   * 只写「本地表真实存在的列」。
   *
   * 为什么必须过滤：`entity.data` 直接来自服务端响应。**服务端一旦新增字段
   * （比如后来给旅行加的 spaceId / budget），旧版 App 的本地表就没有那一列**，
   * 于是 INSERT/UPDATE 会 `no such column` 抛错 —— 拉取对这批实体全部失败，
   * 离线缓存再也更新不了，而且完全无声。这与 local-write 的处理保持一致。
   */
  const actual = await tableColumns(db, entity.table)
  const pickCols = (data: Record<string, unknown>): string[] => {
    const keys = Object.keys(data)
    if (!actual) return keys // 自省失败：不做过滤，行为与旧版一致
    const skipped = keys.filter((k) => !actual.has(k))
    if (skipped.length > 0) {
      console.warn('[pull] 本地表缺列，已跳过：', entity.table, skipped.join(', '))
    }
    return keys.filter((k) => actual.has(k))
  }

  // 按 id 或 remoteId 匹配：本地新建（UUID id + 已回填 remoteId）也能被命中，避免同实体分裂成两行
  const existing = toRows(
    await db.query('SELECT id, updatedAt, syncStatus, deleted FROM ' + entity.table + ' WHERE id = ? OR remoteId = ? LIMIT 1', [
      entity.id,
      entity.remoteId,
    ]),
  )
  if (existing[0]) {
    const row = existing[0]
    // 按列名取值：Android 返回的是列名对象，位置解构会读到错列
    const localDeletion = Number(rowGet(row, 'deleted'))
    const localUpdatedAt = rowGet(row, 'updatedAt')
    const syncStatus = String(rowGet(row, 'syncStatus'))
    if (syncStatus === 'PENDING_UPLOAD') return false // 本地有待上传改动，跳过
    // v3.1 M4-C1：墓碑防复活——本地已删（deleted=1）不覆盖，保持墓碑（即使远端行仍在/更新）
    if (localDeletion === 1) return false
    if (Number(localUpdatedAt) > entity.updatedAt) return false // 本地更新（LWW）

    const fields: Record<string, unknown> = {
      ...entity.data,
      remoteId: entity.remoteId,
      updatedAt: entity.updatedAt,
      syncStatus: 'SYNCED',
      deleted: 0,
    }
    const keys = pickCols(fields)
    if (keys.length === 0) return false // 表结构完全对不上：宁可不写，也不要抛错中断整轮拉取
    const sets = keys.map((c) => c + ' = ?').join(', ')
    await db.run(
      'UPDATE ' + entity.table + ' SET ' + sets + ' WHERE id = ?',
      [...keys.map((c) => fields[c]), String(rowGet(row, 'id'))],
    )
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
  const cols = pickCols(full)
  if (cols.length === 0) return false
  const placeholders = cols.map(() => '?').join(', ')
  await db.run(
    'INSERT INTO ' + entity.table + ' (' + cols.join(', ') + ') VALUES (' + placeholders + ')',
    cols.map((c) => full[c]),
  )
  return true
}

/**
 * 拉取并落地一组实体类型。
 *
 * **逐类型、逐条隔离**：单条实体写失败（表结构不符、脏数据…）不得中断整轮拉取。
 * 原先没有任何 try/catch —— 一条坏数据就会让**所有类型**的拉取全部中止，
 * 离线缓存再也更新不了，而且因为外层是 `void sync()`，界面上完全无声。
 * 这与同步引擎里"阶段隔离"是同一个教训。
 */
export async function pullEntityTypes(dispatcher: PullDispatcher, entityTypes: EntityType[]): Promise<number> {
  if (!isNativePlatform()) return 0
  let written = 0
  for (const type of entityTypes) {
    let entities: PullEntity[]
    try {
      entities = await dispatcher.pull(type)
    } catch {
      continue // 该类型拉取失败（网络/服务端）：跳过，不影响其他类型
    }
    for (const entity of entities) {
      try {
        if (await applyPullEntity(entity)) written += 1
      } catch (e) {
        console.warn('[pull] 单条落地失败，已跳过：', entity?.table, e instanceof Error ? e.message : e)
      }
    }
  }
  return written
}
