/**
 * 碎碎念离线读（Stage 3.0a 接线）：从本地 SQLite 读 moment 表，映射为与在线 API 一致的形状。
 * 供 MomentTimeline 用 readWithFallback 在离线/失败时回退本地。
 */
import { queryRows } from './dao'
import { rowGet } from './native/sqlite-db'
import { isNativePlatform } from './platform'

export interface LocalMoment {
  id: number | string
  content: string
  tags: string[] | null
  createdAt: string
  updatedAt: string
  userId: number | null
  isPublic: boolean
}

function parseTags(raw: unknown): string[] | null {
  if (!raw) return null
  try {
    const p = JSON.parse(String(raw))
    return Array.isArray(p) ? p.map(String) : null
  } catch {
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
  }
}

function msToIso(ms: unknown): string {
  const n = Number(ms)
  if (!n) return ''
  const d = new Date(n)
  return isNaN(d.getTime()) ? String(ms) : d.toISOString()
}

/** 读本地碎碎念（原生端 + 表非空才返回，否则 null 交给 readWithFallback 走远端） */
export async function readLocalMoments(): Promise<LocalMoment[] | null> {
  if (!isNativePlatform()) return null
  try {
    const rows = await queryRows(
      'SELECT id, remoteId, content, tags, userId, isPublic, updatedAt FROM moment WHERE deleted = 0 ORDER BY updatedAt DESC',
    )
    if (rows.length === 0) return null
    // 按列名取值：Android 返回的行是「列名对象」，键序无保证，位置取值会整体错位
    return rows.map((r) => {
      const g = (name: string): unknown => rowGet(r, name)
      const remoteIdRaw = g('remoteId')
      const remoteId = remoteIdRaw == null ? null : Number(remoteIdRaw)
      const localId = String(g('id'))
      const userIdRaw = g('userId')
      return {
        id: remoteId ?? localId,
        content: String(g('content') ?? ''),
        tags: parseTags(g('tags')),
        userId: userIdRaw == null ? null : Number(userIdRaw),
        isPublic: !!g('isPublic'),
        createdAt: msToIso(g('updatedAt')),
        updatedAt: msToIso(g('updatedAt')),
      }
    })
  } catch {
    return null
  }
}
