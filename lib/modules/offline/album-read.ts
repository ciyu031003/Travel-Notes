/**
 * 相册离线读（Stage 3.0a 接线）：从本地 SQLite 读 album 表，映射为与 /api/album 的 albums 一致的形状。
 * 供 /album 页面在离线/失败时回退本地（纪念相册区）。
 */
import { queryRows } from './dao'
import { isNativePlatform } from './platform'

export interface LocalAlbum {
  id: number | string
  title: string
  description: string | null
  coverUrl: string | null
  mediaCount: number
  date: string | null
  createdAt: string
}

function msToIso(ms: unknown): string {
  const n = Number(ms)
  if (!n) return ''
  const d = new Date(n)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

/** 读本地相册列表（原生端 + 表非空才返回，否则 null 交给 readWithFallback 走远端） */
export async function readLocalAlbums(): Promise<LocalAlbum[] | null> {
  if (!isNativePlatform()) return null
  try {
    const rows = await queryRows(
      'SELECT a.id, a.remoteId, a.title, a.description, a.date, a.coverMediaId, a.updatedAt, ' +
        '(SELECT m.remoteUrl FROM media m WHERE m.id = CAST(a.coverMediaId AS TEXT) LIMIT 1) AS coverRemote ' +
        'FROM album a WHERE a.deleted = 0 ORDER BY COALESCE(a.date, a.updatedAt) DESC',
    )
    if (rows.length === 0) return null
    return rows.map((r) => {
      const remoteId = r[1] == null ? null : Number(r[1])
      const localId = String(r[0])
      return {
        id: remoteId ?? localId,
        title: String(r[2] ?? '未命名相册'),
        description: r[3] == null ? null : String(r[3]),
        coverUrl: r[7] ? String(r[7]) : null, // 远端封面 URL，页面侧经 useLocalMediaUrls 解析本地缓存
        mediaCount: 0,
        date: msToIso(r[4]),
        createdAt: msToIso(r[6]),
      }
    })
  } catch {
    return null
  }
}
