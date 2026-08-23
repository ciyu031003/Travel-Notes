/**
 * 旅行离线读（Stage 3.0a 接线）：从本地 SQLite 读 travel 表，映射为与 /api/travels 一致的 posts 形状。
 * 供 /travel 页面用 readWithFallback 在离线/失败时回退本地。
 */
import { queryRows } from './dao'
import { isNativePlatform } from './platform'

export interface LocalTravelPost {
  id: number | string
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
export async function readLocalTravels(): Promise<LocalTravelPost[] | null> {  if (!isNativePlatform()) return null
  try {
    const rows = await queryRows(
      'SELECT id, remoteId, title, slug, description, location, cover, startDate, endDate, visibility, isPublic, updatedAt FROM travel WHERE deleted = 0 ORDER BY COALESCE(startDate, updatedAt) DESC',
    )
    if (rows.length === 0) return null
    return rows.map((r) => {
      const remoteId = r[1] == null ? null : Number(r[1])
      const localId = String(r[0])
      const id = remoteId ?? localId
      const startMs = Number(r[7]) || 0
      return {
        id,
        slug: String(r[3] || '') || 'travel-' + localId,
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
    })
  } catch {
    return null
  }
}

export interface LocalTravelInfo {
  id: number | string
  title: string
  slug: string
  spaceId: number | null
}

/** 按 slug 读本地旅行（record 页离线回退用）：返回云端 id（remoteId）或本地 id */
export async function readLocalTravelBySlug(slug: string): Promise<LocalTravelInfo | null> {
  if (!isNativePlatform() || !slug) return null
  try {
    const rows = await queryRows(
      'SELECT id, remoteId, title, slug, spaceId FROM travel WHERE slug = ? AND deleted = 0 LIMIT 1',
      [slug],
    )
    const r = rows[0]
    if (!r) return null
    const remoteId = r[1] == null ? null : Number(r[1])
    return {
      id: remoteId ?? String(r[0]),
      title: String(r[2] ?? ''),
      slug: String(r[3] ?? slug),
      spaceId: r[4] == null ? null : Number(r[4]),
    }
  } catch {
    return null
  }
}
