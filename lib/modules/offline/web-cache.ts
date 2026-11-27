/**
 * Web 端本地缓存（IndexedDB 轻量 KV）—— P1 本地优先读取层的数据落盘底座。
 * ============================================================================
 * 为什么在 localStorage 之外还要 IDB：`lib/client/persisted-cache` 用 localStorage 存快照，
 * 同步读、首帧就能出内容（这是它不可替代的优点），但它有三个硬限制：
 *   ① 单条上限约 256K 字符、整站约 3M 字符（首页快照 + 旅行列表 + 相册很快就吃满）；
 *   ② 与站内其它 key 共用同一配额，任何一个模块写爆会让**别的模块**写失败；
 *   ③ 读写是同步的，几百 KB 的 JSON.parse 直接卡在首帧/滚动的那一帧上。
 * IndexedDB 异步、容量大（通常按 origin 数百 MB）、不占主线程解析，适合当「主缓存」；
 * localStorage 那一份降级为「首帧同步镜像」。两者命中都用同一套信封校验（见 local-first.ts）。
 *
 * 本模块只做「KV + 容量治理」，不认识任何业务结构：
 *   · 记录带 schemaVersion：读取时版本不一致 → 视为无效并删除（旧结构不进渲染路径）；
 *   · 容量上限：默认 200 条 / 5MB（按 JSON 字符数近似），超出按 lastAccess 最旧优先淘汰（LRU），
 *     淘汰到上限的 60% 为止，避免每次写入都触发一轮淘汰；
 *   · 全部操作 best-effort：不支持 / 隐私模式 / 配额满 / 事务异常一律返回 null 或 false，
 *     绝不抛错 —— 缓存坏掉不能让页面白屏（这是本地优先层的底线）。
 * 无 IDB 的环境（SSR、极老 WebView、被禁用的隐私模式）由调用方优雅降级到 localStorage，
 * 本模块不需要知道降级策略。
 */

/** 库名（全局唯一，便于 DevTools → Application → IndexedDB 里排查） */
export const WEB_CACHE_DB_NAME = 'tiantu-local'
/** 结构化数据表（记录含 value，体积大） */
const STORE_CACHE = 'cache'
/** 元数据表（key/bytes/lastAccess，只用于容量与 LRU 治理，体积恒小） */
const STORE_META = 'meta'
const DB_VERSION = 1
/** 信封版本：缓存结构（字段/语义）变更时 +1，旧记录读取即失效 */
export const WEB_CACHE_SCHEMA_VERSION = 1
/** 条数上限 */
export const WEB_CACHE_MAX_ENTRIES = 200
/** 字节上限（按 JSON 字符数近似，UTF-16 实际内存约为其 2 倍） */
export const WEB_CACHE_MAX_BYTES = 5 * 1024 * 1024
/** 淘汰目标 = 上限 × 该比例（留出后续写入空间，避免每写一条就淘汰一轮） */
const PRUNE_TARGET_RATIO = 0.6
/** open() 的超时：Safari 无痕/沙箱 iframe 下 open 可能永远不回调 */
const OPEN_TIMEOUT_MS = 2000
/** 命中后多久才刷新 lastAccess（避免每次读都写一次事务，削弱 LRU 的收益） */
const TOUCH_INTERVAL_MS = 30_000

interface CacheRecord {
  key: string
  /** 信封版本（与 local-first 的 schemaVersion 对应） */
  v: number
  updatedAt: number
  value: unknown
}

interface MetaRecord {
  key: string
  bytes: number
  updatedAt: number
  lastAccess: number
}

export interface WebCacheHit<T> {
  key: string
  value: T
  /** 落盘时间（ms） */
  updatedAt: number
  /** 距 now 的毫秒数（调用方用来自行判新鲜度） */
  ageMs: number
}

export interface WebCacheReadOptions {
  /** 期望的信封版本；不匹配视为无效（默认 WEB_CACHE_SCHEMA_VERSION） */
  schemaVersion?: number
  /** 超过该年龄视为未命中（不删除，留给 LRU 淘汰；默认不限） */
  maxAgeMs?: number
}

export interface WebCacheWriteOptions {
  schemaVersion?: number
  /** 单条上限（字符数近似）：超出不落盘，避免一次异常响应吃掉整个预算 */
  maxEntryBytes?: number
}

export interface WebCacheStats {
  supported: boolean
  entries: number
  bytes: number
}

let dbPromise: Promise<IDBDatabase | null> | null = null
/** open 失败一次后本进程不再重试（隐私模式下每次重试都是几百 ms 的阻塞开销） */
let dbUnavailable = false
let dbVersionChangeBound = false

/** 当前进程内已 touch 过的 key（减少重复写事务） */
const touchedAt = new Map<string, number>()

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * 是否可用（同步判断，只看能力不看可用性）。
 * 真正的打开失败会在首次读写时把 dbUnavailable 置 true，此后 isWebCacheSupported 恒 false。
 */
export function isWebCacheSupported(): boolean {
  if (dbUnavailable) return false
  if (!isBrowser()) return false
  try {
    return typeof window.indexedDB !== 'undefined' && window.indexedDB != null
  } catch {
    return false
  }
}

/** 把 IDBRequest 包成 Promise（事件回调风格，兼容性最好） */
function requestAsPromise<T>(req: IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error instanceof Error ? req.error : new Error('indexeddb request failed'))
  })
}

/** 等事务完成（此时写入已提交，读路径可以立即看到） */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error instanceof Error ? tx.error : new Error('indexeddb transaction failed'))
    tx.onabort = () => reject(tx.error instanceof Error ? tx.error : new Error('indexeddb transaction aborted'))
  })
}

/** 打开数据库（懒加载 + 单例 + 超时降级） */
function openDb(): Promise<IDBDatabase | null> {
  if (!isWebCacheSupported()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false
    const finish = (db: IDBDatabase | null) => {
      if (settled) return
      settled = true
      resolve(db)
    }
    let req: IDBOpenDBRequest
    try {
      req = window.indexedDB.open(WEB_CACHE_DB_NAME, DB_VERSION)
    } catch {
      dbUnavailable = true
      finish(null)
      return
    }
    const timer = window.setTimeout(() => {
      // 超时：不 reject（调用方只关心有没有），标记本进程不可用，降级到 localStorage
      dbUnavailable = true
      finish(null)
    }, OPEN_TIMEOUT_MS)

    req.onupgradeneeded = () => {
      try {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          const meta = db.createObjectStore(STORE_META, { keyPath: 'key' })
          meta.createIndex('lastAccess', 'lastAccess')
        }
      } catch {
        // 建表失败：交给 onerror/超时兜底
      }
    }

    req.onsuccess = () => {
      window.clearTimeout(timer)
      const db = req.result
      if (!dbVersionChangeBound) {
        dbVersionChangeBound = true
        // 另一个标签页升级了库版本：本页关连接并放弃本进程的 IDB（继续用 localStorage 镜像）
        db.onversionchange = () => {
          try {
            db.close()
          } catch {
            /* 忽略 */
          }
          dbPromise = null
          dbUnavailable = true
        }
      }
      finish(db)
    }

    req.onerror = () => {
      window.clearTimeout(timer)
      dbUnavailable = true
      finish(null)
    }

    // 另一个标签页持有旧版本连接：本次降级，不再重试，避免启动被阻塞
    req.onblocked = () => {
      window.clearTimeout(timer)
      dbUnavailable = true
      finish(null)
    }
  })

  return dbPromise
}

/** JSON 字符数近似（不可序列化返回 -1） */
function estimateBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    return typeof json === 'string' ? json.length : -1
  } catch {
    return -1
  }
}

/** 读全部元数据（体积小，用于容量统计与 LRU 排序） */
async function readAllMeta(db: IDBDatabase): Promise<MetaRecord[]> {
  const tx = db.transaction(STORE_META, 'readonly')
  const all = await requestAsPromise<MetaRecord[]>(tx.objectStore(STORE_META).getAll())
  return Array.isArray(all) ? all : []
}

/** 更新 lastAccess（LRU 用，best-effort，不阻塞读路径） */
async function touchWebCache(key: string): Promise<void> {
  const last = touchedAt.get(key) ?? 0
  const now = Date.now()
  if (now - last < TOUCH_INTERVAL_MS) return
  touchedAt.set(key, now)
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE_META, 'readwrite')
    const store = tx.objectStore(STORE_META)
    const meta = await requestAsPromise<MetaRecord | undefined>(store.get(key))
    if (!meta) return
    store.put({ key: meta.key, bytes: meta.bytes, updatedAt: meta.updatedAt, lastAccess: now })
    await transactionDone(tx)
  } catch {
    // 淘汰/占用冲突：LRU 精度下降无所谓
  }
}

/** 容量治理：超限就按 lastAccess 最旧优先删到目标的 60% */
async function pruneWebCache(db: IDBDatabase): Promise<void> {
  try {
    const metas = await readAllMeta(db)
    let bytes = 0
    for (const meta of metas) bytes += Math.max(0, meta.bytes)
    if (metas.length <= WEB_CACHE_MAX_ENTRIES && bytes <= WEB_CACHE_MAX_BYTES) return

    const targetEntries = Math.floor(WEB_CACHE_MAX_ENTRIES * PRUNE_TARGET_RATIO)
    const targetBytes = Math.floor(WEB_CACHE_MAX_BYTES * PRUNE_TARGET_RATIO)
    const ordered = metas.slice().sort((a, b) => a.lastAccess - b.lastAccess)

    const victims: string[] = []
    let remainingEntries = ordered.length
    let remainingBytes = bytes
    for (const meta of ordered) {
      if (remainingEntries <= targetEntries && remainingBytes <= targetBytes) break
      victims.push(meta.key)
      remainingEntries -= 1
      remainingBytes -= Math.max(0, meta.bytes)
    }
    if (victims.length === 0) return

    const tx = db.transaction([STORE_CACHE, STORE_META], 'readwrite')
    const cacheStore = tx.objectStore(STORE_CACHE)
    const metaStore = tx.objectStore(STORE_META)
    for (const key of victims) {
      cacheStore.delete(key)
      metaStore.delete(key)
      touchedAt.delete(key)
    }
    await transactionDone(tx)
  } catch {
    // 治理失败不影响读写（下次写入会再试）
  }
}

/**
 * 读一条缓存。未命中 / 版本不符 / 超龄 / IDB 不可用 → null（**不抛**）。
 * @param key 完整 key（包含账号作用域前缀，由 local-first 拼好）
 */
export async function readWebCache<T = unknown>(
  key: string,
  opts: WebCacheReadOptions = {},
): Promise<WebCacheHit<T> | null> {
  if (!key) return null
  const db = await openDb()
  if (!db) return null
  const expectVersion = opts.schemaVersion ?? WEB_CACHE_SCHEMA_VERSION
  try {
    const tx = db.transaction(STORE_CACHE, 'readonly')
    const record = await requestAsPromise<CacheRecord | undefined>(tx.objectStore(STORE_CACHE).get(key))
    if (!record) return null
    if (record.v !== expectVersion) {
      // 结构变更后的旧记录：读路径上直接删掉，避免它占着预算
      void deleteWebCache(key)
      return null
    }
    const ageMs = Math.max(0, Date.now() - (record.updatedAt || 0))
    if (opts.maxAgeMs != null && opts.maxAgeMs > 0 && ageMs > opts.maxAgeMs) return null
    void touchWebCache(key)
    return { key, value: record.value as T, updatedAt: record.updatedAt, ageMs }
  } catch {
    return null
  }
}

/**
 * 写一条缓存（异步提交）。返回是否成功。
 * @param key 完整 key（包含账号作用域前缀）
 */
export async function writeWebCache<T = unknown>(
  key: string,
  value: T,
  opts: WebCacheWriteOptions = {},
): Promise<boolean> {
  if (!key || value === undefined) return false
  const bytes = estimateBytes(value)
  if (bytes < 0) return false
  if (opts.maxEntryBytes != null && opts.maxEntryBytes > 0 && bytes > opts.maxEntryBytes) return false

  const db = await openDb()
  if (!db) return false
  const now = Date.now()
  const schemaVersion = opts.schemaVersion ?? WEB_CACHE_SCHEMA_VERSION
  const record: CacheRecord = { key, v: schemaVersion, updatedAt: now, value }
  const meta: MetaRecord = { key, bytes, updatedAt: now, lastAccess: now }
  try {
    const tx = db.transaction([STORE_CACHE, STORE_META], 'readwrite')
    tx.objectStore(STORE_CACHE).put(record)
    tx.objectStore(STORE_META).put(meta)
    await transactionDone(tx)
  } catch {
    // 配额满 / DataCloneError（不可结构化克隆）/ 事务异常：不落盘，但绝不影响页面
    return false
  }
  touchedAt.set(key, now)
  // 治理放到微任务之后：写入方（数据刚上屏）不该等一轮全表扫描
  void pruneWebCache(db)
  return true
}

/** 删除单条（失效某份缓存时用） */
export async function deleteWebCache(key: string): Promise<void> {
  touchedAt.delete(key)
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction([STORE_CACHE, STORE_META], 'readwrite')
    tx.objectStore(STORE_CACHE).delete(key)
    tx.objectStore(STORE_META).delete(key)
    await transactionDone(tx)
  } catch {
    // 忽略
  }
}

/**
 * 清空缓存。传 prefix 只清该前缀（账号作用域），不传清全部。
 * @returns 删除条数（不可用返回 0）
 */
export async function clearWebCache(prefix?: string): Promise<number> {
  const db = await openDb()
  if (!db) return 0
  if (!prefix) {
    touchedAt.clear()
    try {
      const tx = db.transaction([STORE_CACHE, STORE_META], 'readwrite')
      tx.objectStore(STORE_CACHE).clear()
      tx.objectStore(STORE_META).clear()
      await transactionDone(tx)
    } catch {
      return 0
    }
    return 0
  }
  try {
    const metas = await readAllMeta(db)
    const victims = metas.filter((meta) => meta.key.indexOf(prefix) === 0).map((meta) => meta.key)
    if (victims.length === 0) return 0
    for (const key of victims) touchedAt.delete(key)
    const tx = db.transaction([STORE_CACHE, STORE_META], 'readwrite')
    const cacheStore = tx.objectStore(STORE_CACHE)
    const metaStore = tx.objectStore(STORE_META)
    for (const key of victims) {
      cacheStore.delete(key)
      metaStore.delete(key)
    }
    await transactionDone(tx)
    return victims.length
  } catch {
    return 0
  }
}

/**
 * 把 fromPrefix 开头的记录整体改名为 toPrefix 开头（账号首次认领时 anon → acc）。
 *
 * 为什么需要：作用域标记是异步校准出来的（首帧前不能阻塞），第一次启动时数据可能先写进
 * anon 命名空间；如果不搬，用户下次启动会读不到这批缓存，白白多等一次网络。
 * 迁移只搬运、不改变记录内容（信封里的 updatedAt 原样保留 → 新鲜度判定不乱）。
 * @returns 迁移条数（IDB 不可用时 0）
 */
export async function renameWebCachePrefix(fromPrefix: string, toPrefix: string): Promise<number> {
  if (!fromPrefix || !toPrefix || fromPrefix === toPrefix) return 0
  const db = await openDb()
  if (!db) return 0
  try {
    const tx = db.transaction([STORE_CACHE, STORE_META], 'readwrite')
    const cacheStore = tx.objectStore(STORE_CACHE)
    const metaStore = tx.objectStore(STORE_META)
    const records = await requestAsPromise<CacheRecord[]>(cacheStore.getAll())
    const metas = await requestAsPromise<MetaRecord[]>(metaStore.getAll())
    const metaByKey = new Map<string, MetaRecord>()
    for (const meta of metas) metaByKey.set(meta.key, meta)
    let moved = 0
    for (const record of records) {
      if (record.key.indexOf(fromPrefix) !== 0) continue
      const key = toPrefix + record.key.slice(fromPrefix.length)
      cacheStore.put({ ...record, key })
      cacheStore.delete(record.key)
      const meta = metaByKey.get(record.key)
      if (meta) {
        metaStore.put({ ...meta, key })
        metaStore.delete(record.key)
      }
      touchedAt.delete(record.key)
      moved += 1
    }
    await transactionDone(tx)
    return moved
  } catch {
    return 0
  }
}

/** 诊断：当前条数 / 字节数（本地优先层的「实测数据」与排查都靠它） */
export async function webCacheStats(): Promise<WebCacheStats> {
  const db = await openDb()
  if (!db) return { supported: isWebCacheSupported(), entries: 0, bytes: 0 }
  try {
    const metas = await readAllMeta(db)
    let bytes = 0
    for (const meta of metas) bytes += Math.max(0, meta.bytes)
    return { supported: true, entries: metas.length, bytes }
  } catch {
    return { supported: true, entries: 0, bytes: 0 }
  }
}
