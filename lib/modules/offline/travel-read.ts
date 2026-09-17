/**
 * 旅行离线读（Stage 3.0a 接线）：从本地 SQLite 读 travel 表，映射为与 /api/travels 一致的 posts 形状。
 * 供 /travel 页面用 readWithFallback 在离线/失败时回退本地。
 */
import { queryRows } from './dao'
import { isNativePlatform } from './platform'

export interface LocalTravelPost {
  id: number | string
  /** 本地行 id（字符串）——本地未同步时需要它来定位详情 */
  localId: string
  /** 云端主键；未同步为 null */
  remoteId: number | null
  /** 本地行同步状态：PENDING_UPLOAD 表示还没上传到云端 */
  syncStatus: string
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images: string[]
  videos: unknown[]
  tags: string[]
  location?: string
  type: 'travel'
  published: true
}

/** 读本地旅行列表（原生端 + 表非空才返回，否则 null 交给 readWithFallback 走远端） */
export async function readLocalTravels(): Promise<LocalTravelPost[] | null> {
  const rows = await queryLocalTravelRows()
  if (rows == null || rows.length === 0) return null
  return rows.map(toLocalTravelPost)
}

/**
 * 读**全部**本地旅行（含已同步与待同步），原生端且表非空才返回，否则 null。
 *
 * 与 `readLocalTravels` 的区别只是语义定位：本函数供「远端列表 + 本地待同步项」合并使用，
 * 因此不过滤 syncStatus —— 已同步项用于兜底去重，待同步项用于补齐用户刚建的那一本。
 */
export async function readAllLocalTravels(): Promise<LocalTravelPost[] | null> {
  const rows = await queryLocalTravelRows()
  if (rows == null || rows.length === 0) return null
  return rows.map(toLocalTravelPost)
}

type LocalTravelRow = unknown[]

const LOCAL_TRAVEL_SELECT =
  'SELECT id, remoteId, title, slug, description, location, cover, startDate, endDate, visibility, isPublic, updatedAt, syncStatus FROM travel WHERE deleted = 0 ORDER BY COALESCE(startDate, updatedAt) DESC'

async function queryLocalTravelRows(): Promise<LocalTravelRow[] | null> {
  if (!isNativePlatform()) return null
  try {
    return await queryRows(LOCAL_TRAVEL_SELECT)
  } catch {
    return null
  }
}

function toLocalTravelPost(r: LocalTravelRow): LocalTravelPost {
  const remoteId = r[1] == null ? null : Number(r[1])
  const localId = String(r[0])
  const id = remoteId ?? localId
  const startMs = Number(r[7]) || 0
  // slug 兜底只针对**历史遗留的空 slug 行**（新建已经会写入确定的 slug）
  const storedSlug = String(r[3] || '').trim()
  return {
    id,
    /** 本地行 id（字符串）；用于「本地未同步」判断与本地详情定位 */
    localId,
    remoteId,
    syncStatus: r[12] == null ? 'SYNCED' : String(r[12]),
    slug: storedSlug || 'travel-' + localId,
    title: String(r[2] ?? '未命名旅行'),
    date: startMs ? new Date(startMs).toISOString() : '',
    description: r[4] == null ? undefined : String(r[4]),
    cover: r[6] == null ? undefined : String(r[6]),
    images: [] as string[],
    videos: [] as unknown[],
    tags: [] as string[],
    location: r[5] == null ? undefined : String(r[5]),
    type: 'travel',
    published: true,
  }
}

/**
 * 远端列表 + 本地旅行合并。
 *
 * 为什么必须合并：`/travel` 原先用 `readWithFallback(remote, local)`，**在线时只返回远端**，
 * 于是「刚在 App 里新建、还在同步队列里」的旅行不会出现在列表中 ——
 * 用户建完旅行回到列表看不到它，以为没建成（真机反馈的 bug）。
 *
 * 合并规则：
 *  - 远端项优先保留（含服务端 slug / 封面 / 计数）；
 *  - 本地项按 `remoteId` 或 `slug` 判断是否已在远端出现，已出现则跳过（避免重复）；
 *  - 只有本地才有的项插到列表最前，并带 `localOnly: true` 供 UI 标注"待同步"。
 */
export function mergeLocalTravelsIntoRemote<T extends Record<string, unknown>>(
  remote: T[],
  local: LocalTravelPost[] | null,
): (T | (LocalTravelPost & { localOnly: true }))[] {
  if (!local || local.length === 0) return remote

  const remoteIds = new Set<number>()
  const remoteSlugs = new Set<string>()
  for (const r of remote) {
    const id = Number((r as { id?: unknown }).id)
    if (Number.isFinite(id)) remoteIds.add(id)
    const slug = String((r as { slug?: unknown }).slug || '')
    if (slug) remoteSlugs.add(slug)
  }

  const localOnly = local.filter((l) => {
    if (l.remoteId != null && remoteIds.has(l.remoteId)) return false
    if (l.slug && remoteSlugs.has(l.slug)) return false
    return true
  })

  if (localOnly.length === 0) return remote
  return [...localOnly.map((l) => ({ ...l, localOnly: true as const })), ...remote]
}

export interface LocalTravelInfo {
  id: number | string
  /** 本地行 id（字符串） */
  localId: string
  /** 云端主键；未同步为 null */
  remoteId: number | null
  /** 是否还没上传到云端（此时不能挂回忆/照片，需先同步） */
  pendingSync: boolean
  title: string
  slug: string
  spaceId: number | null
  description?: string
  location?: string
  startDate?: string | null
  endDate?: string | null
  travelType?: string | null
  companions?: unknown
}

/**
 * 按 slug 读本地旅行（详情页 / record 页离线回退用）。
 * 返回云端 id（remoteId）或本地 id，并显式告知是否仍未同步。
 */
export async function readLocalTravelBySlug(slug: string): Promise<LocalTravelInfo | null> {
  if (!isNativePlatform() || !slug) return null
  try {
    const rows = await queryRows(
      "SELECT id, remoteId, title, slug, spaceId, description, location, startDate, endDate, travelType, companions, syncStatus FROM travel WHERE slug = ? AND deleted = 0 LIMIT 1",
      [slug],
    )
    const r = rows[0]
    if (!r) return null
    const remoteId = r[1] == null ? null : Number(r[1])
    const localId = String(r[0])
    const startMs = Number(r[7]) || 0
    const endMs = Number(r[8]) || 0
    let companions: unknown = null
    try {
      companions = r[10] ? JSON.parse(String(r[10])) : null
    } catch {
      companions = null
    }
    return {
      id: remoteId ?? localId,
      localId,
      remoteId,
      pendingSync: remoteId == null || String(r[11] || '') !== 'SYNCED',
      title: String(r[2] ?? ''),
      slug: String(r[3] ?? slug),
      spaceId: r[4] == null ? null : Number(r[4]),
      description: r[5] == null ? undefined : String(r[5]),
      location: r[6] == null ? undefined : String(r[6]),
      startDate: startMs ? new Date(startMs).toISOString() : null,
      endDate: endMs ? new Date(endMs).toISOString() : null,
      travelType: r[9] == null ? null : String(r[9]),
      companions,
    }
  } catch {
    return null
  }
}
