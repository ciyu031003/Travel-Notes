/**
 * 本地 JSON 快照（原生 SQLite `home_snapshot` 表）—— 原生端的「本地优先」底座。
 *
 * 历史：本模块最初只服务首页（P2-29：把 /api/home 响应落库，离线时兜底），所以表/文件叫
 * home_snapshot。P1 本地优先读取层复用它做**通用 key → JSON 快照**（表里本来就有 key 列，
 * 不需要改 schema）：`/api/home`、`/api/travels` 等读取结果都落这里。
 *
 * 校验机制（与 Web 端 IDB 缓存同一套语义，见 local-first.ts）：
 *  · 写入统一包成信封 `{ v, updatedAt, data }`：`v` 是结构版本，**读取时版本不一致直接当未命中**
 *    （旧结构数据不进渲染路径，避免字段改名后页面崩在半渲染状态）；
 *  · 兼容早期格式：1.30.16 之前 OfflineBootstrap 直接写入原始响应（没有信封），读取时按
 *    「legacy 原始数据」接受并使用行上的 updatedAt —— 升级用户不会丢掉离线首页；
 *  · 体积上限 512KB：异常响应不落库，避免把本地库撑大；
 *  · 全部 best-effort：表不存在（老库）/ 磁盘满 / JSON 解析失败一律静默返回 false / null。
 */
import { isNativePlatform } from './platform'
import { getOfflineDb, toRows, rowGet } from './native/sqlite-db'

/** 首页快照的旧 key（OfflineBootstrap 写入端仍用它，保持兼容） */
const SNAPSHOT_KEY = 'home'
const MAX_SNAPSHOT_BYTES = 512 * 1024

/** 快照信封版本：结构/语义变更时 +1，旧快照读取即失效 */
export const OFFLINE_SNAPSHOT_VERSION = 1

export interface HomeSnapshot<T = unknown> {
  data: T
  savedAt: number
}

/** 读取结果：updatedAt 是快照落库时间（新鲜度判定用） */
export interface OfflineSnapshotHit<T> {
  data: T
  updatedAt: number
  /** true = 1.30.16 之前的无信封原始响应（升级兼容） */
  legacy?: boolean
}

export interface OfflineSnapshotReadOptions<T> {
  /** 期望的信封版本（默认 OFFLINE_SNAPSHOT_VERSION） */
  version?: number
  /** 结构校验：返回 false 视为损坏（当作未命中） */
  validate?: (value: unknown) => value is T
  /** 超过该年龄视为未命中（ms；0/不传不限） */
  maxAgeMs?: number
}

interface SnapshotEnvelope {
  v: number
  updatedAt: number
  data: unknown
}

function isEnvelope(value: unknown): value is SnapshotEnvelope {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.v === 'number' && typeof obj.updatedAt === 'number' && 'data' in obj
}

async function writeSnapshotJson(key: string, json: string, updatedAt: number): Promise<boolean> {
  try {
    const db = await getOfflineDb()
    await db.run(
      'INSERT INTO home_snapshot (key, json, updatedAt) VALUES (?, ?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET json = excluded.json, updatedAt = excluded.updatedAt',
      [key, json, updatedAt],
    )
    return true
  } catch {
    // 表不存在（老库）/磁盘满：不阻断调用方
    return false
  }
}

/**
 * 写一份快照（信封格式）。返回是否落库。
 * @param key 逻辑 key（不带账号前缀；原生库整体按账号隔离，见 account-scope.ts）
 */
export async function saveOfflineSnapshot(key: string, data: unknown): Promise<boolean> {
  if (!isNativePlatform() || !key || data == null) return false
  const updatedAt = Date.now()
  const envelope: SnapshotEnvelope = { v: OFFLINE_SNAPSHOT_VERSION, updatedAt, data }
  let json: string
  try {
    json = JSON.stringify(envelope)
  } catch {
    return false
  }
  if (json.length > MAX_SNAPSHOT_BYTES) return false
  return writeSnapshotJson(key, json, updatedAt)
}

/**
 * 读一份快照。未命中 / 版本不符 / 校验失败 / 超龄 → null（**不抛**）。
 */
export async function readOfflineSnapshot<T = unknown>(
  key: string,
  opts: OfflineSnapshotReadOptions<T> = {},
): Promise<OfflineSnapshotHit<T> | null> {
  if (!isNativePlatform() || !key) return null
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT json, updatedAt FROM home_snapshot WHERE key = ? LIMIT 1', [key]))
    if (!rows[0]) return null
    const json = rowGet(rows[0], 'json')
    if (typeof json !== 'string' || !json) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return null
    }
    const rowUpdatedAt = Number(rowGet(rows[0], 'updatedAt')) || 0
    const expectVersion = opts.version ?? OFFLINE_SNAPSHOT_VERSION

    let hit: OfflineSnapshotHit<T>
    if (isEnvelope(parsed)) {
      if (parsed.v !== expectVersion) return null
      if (opts.validate && !opts.validate(parsed.data)) return null
      hit = { data: parsed.data as T, updatedAt: parsed.updatedAt || rowUpdatedAt }
    } else {
      // 早期格式：原始响应，没有版本信息 —— 只做结构校验，按 legacy 接受
      if (opts.validate && !opts.validate(parsed)) return null
      hit = { data: parsed as T, updatedAt: rowUpdatedAt, legacy: true }
    }
    if (opts.maxAgeMs != null && opts.maxAgeMs > 0 && Date.now() - hit.updatedAt > opts.maxAgeMs) return null
    return hit
  } catch {
    return null
  }
}

/** 删除单份快照 */
export async function deleteOfflineSnapshot(key: string): Promise<void> {
  if (!isNativePlatform() || !key) return
  try {
    const db = await getOfflineDb()
    await db.run('DELETE FROM home_snapshot WHERE key = ?', [key])
  } catch {
    // 忽略
  }
}

/** 按 key 前缀批量删除（账号切换/退出登录时清本地优先层的命名空间） */
export async function deleteOfflineSnapshotsByPrefix(prefix: string): Promise<number> {
  if (!isNativePlatform() || !prefix) return 0
  try {
    const db = await getOfflineDb()
    await db.run('DELETE FROM home_snapshot WHERE key LIKE ?', [prefix + '%'])
    return 0
  } catch {
    return 0
  }
}

/**
 * 原样存 JSON（调用方自带信封/版本策略）—— 本地优先读取层用。
 * 与 saveOfflineSnapshot 的区别：这里不再套一层信封，版本校验完全由调用方负责，
 * 避免「信封套信封」导致读回时结构判断错位。
 */
export async function saveOfflineSnapshotValue(key: string, value: unknown): Promise<boolean> {
  if (!isNativePlatform() || !key || value === undefined) return false
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return false
  }
  if (json.length > MAX_SNAPSHOT_BYTES) return false
  return writeSnapshotJson(key, json, Date.now())
}

/** 读原样 JSON（不做信封解释；调用方自行解析/校验），未命中或损坏返回 null */
export async function readOfflineSnapshotValue<T = unknown>(
  key: string,
): Promise<{ value: T; updatedAt: number } | null> {
  if (!isNativePlatform() || !key) return null
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT json, updatedAt FROM home_snapshot WHERE key = ? LIMIT 1', [key]))
    if (!rows[0]) return null
    const json = rowGet(rows[0], 'json')
    if (typeof json !== 'string' || !json) return null
    return { value: JSON.parse(json) as T, updatedAt: Number(rowGet(rows[0], 'updatedAt')) || 0 }
  } catch {
    return null
  }
}

/** 把 fromPrefix 开头的快照 key 整体改名为 toPrefix（账号首次认领时 anon → acc） */
export async function renameOfflineSnapshotPrefix(fromPrefix: string, toPrefix: string): Promise<number> {
  if (!isNativePlatform() || !fromPrefix || !toPrefix || fromPrefix === toPrefix) return 0
  try {
    const db = await getOfflineDb()
    const rows = toRows(
      await db.query('SELECT key, json, updatedAt FROM home_snapshot WHERE key LIKE ?', [fromPrefix + '%']),
    )
    let moved = 0
    for (const row of rows) {
      const key = String(rowGet(row, 'key') ?? '')
      const json = rowGet(row, 'json')
      if (!key || typeof json !== 'string') continue
      const nextKey = toPrefix + key.slice(fromPrefix.length)
      await db.run(
        'INSERT INTO home_snapshot (key, json, updatedAt) VALUES (?, ?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET json = excluded.json, updatedAt = excluded.updatedAt',
        [nextKey, json, Number(rowGet(row, 'updatedAt')) || Date.now()],
      )
      await db.run('DELETE FROM home_snapshot WHERE key = ?', [key])
      moved += 1
    }
    return moved
  } catch {
    return 0
  }
}

/** 首页快照（旧 API 兼容：OfflineBootstrap 的写入端不变） */
export async function saveHomeSnapshot(data: unknown): Promise<boolean> {
  return saveOfflineSnapshot(SNAPSHOT_KEY, data)
}

/** 首页快照（旧 API 兼容：返回原始数据 + savedAt） */
export async function readHomeSnapshot<T = unknown>(): Promise<HomeSnapshot<T> | null> {
  const hit = await readOfflineSnapshot<T>(SNAPSHOT_KEY)
  if (!hit) return null
  return { data: hit.data, savedAt: hit.updatedAt }
}
