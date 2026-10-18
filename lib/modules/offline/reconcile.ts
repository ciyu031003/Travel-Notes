/**
 * 离线状态对账（P1-24 / M-3）。
 *
 * 背景：本地写入是"行 + 队列项"两步，进程在两步之间被杀（低内存、用户强杀、
 * Android 后台收紧）就只剩一条 syncStatus='PENDING_UPLOAD' 的行：
 *   · SyncEngine 只读队列 → 这条内容**永远不会上传**；
 *   · pull.ts 又对 PENDING_UPLOAD 永久跳过 → 它也**永远不会被远端覆盖**。
 * 结果就是 UI 一直挂"待同步"，用户只能删掉重写。
 *
 * 本模块在引擎启动时做两件事（都幂等、都逐条容错）：
 *   ① 回收卡死的 SYNCING（上传途中被杀）→ 回到 PENDING；
 *   ② 补齐丢失的队列项（PENDING_UPLOAD 行但队列里没有它）→ 按行数据重建 payload。
 *
 * 注意：这是**兜底**，不是主路径。主路径已改为"先入队再写行"（见 local-write /
 * media-upload），正常情况下不会产生不一致。
 */
import { getOfflineDb, toRows, rowGet, tableColumns, type Row } from './native/sqlite-db'
import { isNativePlatform } from './platform'
import type { SyncQueue } from './sync-queue'
import type { EntityType } from './types'

/** 上传中超过这个时长仍未结束，视为进程被杀/网络僵死，回收为 PENDING */
const STALE_SYNCING_MS = 10 * 60_000

/**
 * 参与对账的实体表。media 表**不在其中**：重建 UPLOAD_MEDIA payload 需要 albumId，
 * 而 media 行上没有这一列（在 album_media 里），硬猜会把照片传到错误相册。
 * 媒体侧的不一致由"先入队再写行"从源头消除。
 */
const RECONCILE_TABLES: Array<{ table: string; entityType: EntityType }> = [
  { table: 'travel', entityType: 'TRAVEL' },
  { table: 'travel_day', entityType: 'TRAVEL_DAY' },
  { table: 'memory', entityType: 'MEMORY' },
  { table: 'album', entityType: 'ALBUM' },
  { table: 'moment', entityType: 'MOMENT' },
]

/** 行 → 队列 payload（列名 → 值）。优先用列名映射，避免依赖 Android 对象行的键序 */
function rowToPayload(row: Row, cols: Set<string>): Record<string, unknown> {
  const byName = (row as { __byName?: Record<string, unknown> }).__byName
  let data: Record<string, unknown>
  if (byName) {
    data = { ...byName }
  } else {
    data = {}
    let i = 0
    // 用 forEach 而不是 for..of：tsconfig target 是 ES5，直接迭代 Set 会触发 TS2802
    cols.forEach((col) => {
      data[col] = row[i]
      i += 1
    })
  }
  // 这两个是本地状态，服务端不接受（syncStatus 由服务端自己维护）
  delete data.syncStatus
  delete data.deleted
  return data
}

/** 回收卡死的 SYNCING 项（返回回收条数） */
export async function reclaimStaleSyncing(queue: SyncQueue): Promise<number> {
  if (!isNativePlatform()) return 0
  let items
  try {
    items = await queue.all()
  } catch {
    return 0 // 队列读不出来：交给下一轮，对账不能阻断启动
  }
  const now = Date.now()
  let reclaimed = 0
  for (const item of items) {
    if (item.status !== 'SYNCING') continue
    if (now - item.updatedAt < STALE_SYNCING_MS) continue
    try {
      await queue.retry(item.id)
      reclaimed += 1
    } catch {
      // 单条失败跳过
    }
  }
  return reclaimed
}

/** 补齐"有本地行、无队列项"的待上传记录（返回重建条数） */
export async function reconcilePendingUploads(queue: SyncQueue): Promise<number> {
  if (!isNativePlatform()) return 0
  let queuedEntityIds: Set<string>
  try {
    queuedEntityIds = new Set(
      (await queue.all())
        .map((i) => i.entityId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    )
  } catch {
    return 0 // 连队列都读不出来时不要乱补（会补出一堆重复项）
  }

  let recreated = 0
  for (const { table, entityType } of RECONCILE_TABLES) {
    let cols: Set<string> | null
    let rows: Row[]
    try {
      const db = await getOfflineDb()
      cols = await tableColumns(db, table)
      if (!cols || cols.size === 0) continue // 老库没有这张表
      rows = toRows(await db.query('SELECT * FROM ' + table + ' WHERE syncStatus = ? AND deleted = 0', ['PENDING_UPLOAD']))
    } catch {
      continue // 单表读失败不影响其它表
    }
    for (const row of rows) {
      const id = rowGet(row, 'id')
      if (typeof id !== 'string' || !id) continue
      if (queuedEntityIds.has(id)) continue
      const remoteRaw = rowGet(row, 'remoteId')
      const remoteId = remoteRaw == null ? null : Number(remoteRaw)
      try {
        await queue.enqueue({
          entityType,
          entityId: id,
          remoteId: Number.isFinite(remoteId as number) ? (remoteId as number) : null,
          operation: remoteId != null ? 'UPDATE' : 'CREATE',
          payload: rowToPayload(row, cols),
        })
        queuedEntityIds.add(id)
        recreated += 1
      } catch {
        // 单条入队失败（磁盘满等）跳过，下一轮再试
      }
    }
  }
  return recreated
}

/** 引擎启动时调用：先回收卡死项，再补齐丢失项 */
export async function reconcileOfflineState(queue: SyncQueue): Promise<{ reclaimed: number; recreated: number }> {
  const reclaimed = await reclaimStaleSyncing(queue)
  const recreated = await reconcilePendingUploads(queue)
  return { reclaimed, recreated }
}
