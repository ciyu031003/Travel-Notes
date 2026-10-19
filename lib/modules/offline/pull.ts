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
import { setMeta, META_KEYS } from './meta'
import type { PullDispatcher, PullEntity, PullChanges, PullTombstone } from './pull-dispatcher'
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
  /** 所有类型都成功才推进游标：否则下次 since 会跳过失败类型的增量（静默丢更新） */
  let allTypesOk = true
  for (const type of entityTypes) {
    let entities: PullEntity[]
    try {
      entities = await dispatcher.pull(type)
    } catch {
      allTypesOk = false
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
  /**
   * 增量拉取游标（P2-29）：下一次 pull 带上 updatedSince，服务端支持后即变成增量同步。
   * 服务端当前忽略该参数 → 行为与改动前完全一致（每次仍返回全量），所以是安全的兼容加法。
   */
  if (allTypesOk && entityTypes.length > 0) {
    await setMeta(META_KEYS.lastSyncAt, Date.now())
  }
  return written
}

/** 墓碑实体类型 → 本地表名（B4） */
const TOMBSTONE_TABLES: Record<PullTombstone['entityType'], string> = {
  Travel: 'travel',
  Moment: 'moment',
  Album: 'album',
  Memory: 'memory',
}

/**
 * 删除主行时一并清理的本地子表（SQLite 未开外键强制，避免孤儿关联）。
 * 注意：**不删 media 行** —— 服务端删除 Memory 时 Media 只是解除 memoryId 关联
 * （onDelete: SetNull），照片本身仍可能挂在别的回忆/相册里；本地保留元数据更安全。
 */
const TOMBSTONE_CHILD_TABLES: Partial<Record<string, Array<{ table: string; column: string }>>> = {
  memory: [{ table: 'memory_media', column: 'memoryId' }],
  album: [{ table: 'album_media', column: 'albumId' }],
}

/**
 * B4：应用一条服务端墓碑 —— 删除对应本地行。
 *
 * 保护：本地若有**未上传改动**（syncStatus=PENDING_UPLOAD），保留本地行
 * （以本地操作为准；上传完成后下一轮增量会再收到该墓碑并清理）。
 */
export async function applyPullTombstone(tombstone: PullTombstone): Promise<boolean> {
  if (!isNativePlatform()) return false
  const table = TOMBSTONE_TABLES[tombstone.entityType]
  if (!table) return false
  const db = await getOfflineDb()

  const existing = toRows(
    await db.query('SELECT id, syncStatus FROM ' + table + ' WHERE id = ? OR remoteId = ? LIMIT 1', [
      String(tombstone.entityId),
      tombstone.entityId,
    ]),
  )
  if (!existing[0]) return false
  const row = existing[0]
  // 按列名取值：Android 返回列名对象，位置解构会读到错列
  if (String(rowGet(row, 'syncStatus')) === 'PENDING_UPLOAD') return false
  const localId = String(rowGet(row, 'id'))

  for (const child of TOMBSTONE_CHILD_TABLES[table] ?? []) {
    await db.run('DELETE FROM ' + child.table + ' WHERE ' + child.column + ' = ?', [localId]).catch(() => {})
  }
  await db.run('DELETE FROM ' + table + ' WHERE id = ?', [localId])
  return true
}

/**
 * B4：增量拉取（优先路径）。
 *
 * 返回 null = 服务端不支持该端点/请求失败 → 调用方回退到全量拉取（行为与改动前一致）。
 * 返回数字 = 本轮落地的变更数（实体 upsert + 墓碑删除）。
 *
 * 游标只在**所有变更都处理成功**后推进到服务端 `serverTime`（不是客户端 now）：
 * 失败时保留旧游标，下一轮重新拉同一段增量（upsert/删除都是幂等的）。
 */
export async function pullIncremental(dispatcher: PullDispatcher): Promise<number | null> {
  if (!isNativePlatform()) return 0
  if (!dispatcher.pullChanges) return null

  let changes: PullChanges | null
  try {
    changes = await dispatcher.pullChanges()
  } catch {
    return null
  }
  if (!changes) return null

  let written = 0
  let allOk = true

  for (const entity of changes.entities) {
    try {
      if (await applyPullEntity(entity)) written += 1
    } catch (e) {
      allOk = false
      console.warn('[pull] 增量实体落地失败，保留游标待下轮重试：', entity?.table, e instanceof Error ? e.message : e)
    }
  }

  for (const tombstone of changes.tombstones) {
    try {
      if (await applyPullTombstone(tombstone)) written += 1
    } catch (e) {
      allOk = false
      console.warn('[pull] 墓碑落地失败，保留游标待下轮重试：', tombstone?.entityType, e instanceof Error ? e.message : e)
    }
  }

  if (allOk) {
    await setMeta(META_KEYS.syncCursor, changes.serverTime)
    // 兼容旧逻辑：lastSyncAt 同时推进（全量回退分支仍读它）
    await setMeta(META_KEYS.lastSyncAt, changes.serverTime)
  }
  return written
}
